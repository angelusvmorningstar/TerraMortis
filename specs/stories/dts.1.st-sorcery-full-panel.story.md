# Story DTS-1: ST-Created Sorcery — Full Panel Rendering

Status: ready-for-dev

## Story

As an ST adding a sorcery action for a character,
I want the action panel to show the full sorcery interface — tradition, rite selector, targets, Mandragora Garden, computed pool, and roll button —
so that I can actually process the rite instead of staring at a useless generic panel.

## Acceptance Criteria

1. An ST-created action with `action_type === 'sorcery'` renders the full two-column sorcery panel: details card (tradition, rite, targets, notes) on the left; dice pool modifiers, roll card, and validation status on the right.
2. The Mandragora Garden checkbox appears in the right panel if the character has the merit and the tradition is Cruac.
3. The Roll button is active when a rite is selected; it computes the pool the same way as player-submitted sorcery actions.
4. Status buttons are Pending / Committed / Resolved / No Effect / Skip (same as player sorcery).
5. The "Add ST Action" form, when type "Sorcery" is selected, shows a tradition dropdown (Cruac / Theban Sorcery) and a rite dropdown (grouped by tradition, sorted by rank). The free-text label input is hidden for sorcery type.
6. Creating a sorcery ST action from the form saves `tradition` and `rite_name` to `st_actions[idx]` alongside `action_type`, `label` (auto-set to rite name), and `description`.
7. No regression on existing sorcery E2E tests (player-submitted sorcery entries unchanged).
8. E2E: 3 tests:
   - ST sorcery action renders full panel (tradition/rite details visible)
   - Right panel shows Roll button when rite is selected
   - Status buttons match sorcery set (Resolved / No Effect)

## Tasks / Subtasks

- [ ] Task 1: Extend `isSorcery` flag in `renderActionPanel` (AC: 1–4)
  - [ ] Find line ~6192: `const isSorcery = entry.source === 'sorcery';`
  - [ ] Replace with:
    ```js
    const isSorcery = entry.source === 'sorcery'
                   || (entry.source === 'st_created' && entry.actionType === 'sorcery');
    ```
  - [ ] No other changes needed for the rendering path — all downstream checks read `isSorcery`

- [ ] Task 2: Add `tradition` + `rite_name` to queue entry for ST-created sorcery (AC: 2–3)
  - [ ] In `buildProcessingQueue`, in the ST-created actions loop (~line 2147):
    ```js
    queue.push({
      key: `${sub._id}:st:${idx}`,
      subId: sub._id,
      source: 'st_created',
      actionIdx: idx,
      charName,
      phase,
      phaseNum,
      actionType: stAction.action_type,
      label: stAction.label,
      description: stAction.description || '',
      poolPlayer: stAction.pool_player || '',
      riteName: stAction.rite_name || stAction.label,   // ← use rite_name if stored
      tradition: stAction.tradition || '',               // ← new field
    });
    ```

- [ ] Task 3: Fix `addStAction` to accept and store `tradition` + `rite_name` (AC: 6)
  - [ ] In `addStAction` (~line 4775):
    ```js
    stActions.push({
      action_type:  actionDef.action_type,
      label:        actionDef.label,
      description:  actionDef.description || '',
      pool_player:  actionDef.pool_player || '',
      tradition:    actionDef.tradition   || '',   // ← new
      rite_name:    actionDef.rite_name   || '',   // ← new
    });
    ```

- [ ] Task 4: Update the "Add ST Action" form to show tradition + rite dropdowns for sorcery type (AC: 5–6)
  - [ ] In `renderProcessingMode`, find the `proc-add-st-form` HTML block (~line 3407)
  - [ ] Replace current label/description inputs with a conditional block:
    ```js
    h += `<div class="proc-add-st-form">`;
    h += `<select class="proc-add-st-type" data-sub-id="${esc(sub._id)}">`;
    h += `<option value="sorcery">Sorcery</option>`;
    h += `<option value="project">Project</option>`;
    h += `<option value="merit">Merit action</option>`;
    h += `</select>`;
    // Sorcery-specific fields (shown/hidden via JS based on type select)
    h += `<div class="proc-add-st-sorc-fields">`;
    // Tradition dropdown
    h += `<select class="proc-add-st-tradition" data-sub-id="${esc(sub._id)}">`;
    h += `<option value="">— Tradition —</option>`;
    h += `<option value="Cruac">Cruac</option>`;
    h += `<option value="Theban Sorcery">Theban Sorcery</option>`;
    h += `</select>`;
    // Rite dropdown (same grouped structure as sorc-rite-sel)
    {
      const _allRites = (_getRulesDB() || []).filter(r => r.category === 'rite');
      const _tradOrder = ['Cruac', 'Theban'];
      const _byTrad = {};
      for (const r of _allRites) { const t = r.parent || 'Unknown'; if (!_byTrad[t]) _byTrad[t] = []; _byTrad[t].push(r); }
      const _tradKeys = [..._tradOrder.filter(t => _byTrad[t]), ...Object.keys(_byTrad).filter(t => !_tradOrder.includes(t))];
      let _riteOpts = `<option value="">— Select Rite —</option>`;
      for (const trad of _tradKeys) {
        const grp = (_byTrad[trad] || []).slice().sort((a, b) => (a.rank || 0) - (b.rank || 0) || a.name.localeCompare(b.name));
        _riteOpts += `<optgroup label="${esc(trad)}">${grp.map(r => `<option value="${esc(r.name)}">${esc(r.name)} (Level ${r.rank || _getRiteLevel(r.name) || '?'})</option>`).join('')}</optgroup>`;
      }
      h += `<select class="proc-add-st-rite" data-sub-id="${esc(sub._id)}">${_riteOpts}</select>`;
    }
    h += `</div>`;
    // Non-sorcery fields (label + description)
    h += `<div class="proc-add-st-other-fields">`;
    h += `<input class="proc-add-st-label" type="text" placeholder="Label (e.g. Theban: Rite of X)" data-sub-id="${esc(sub._id)}">`;
    h += `<input class="proc-add-st-desc" type="text" placeholder="Description / notes (optional)" data-sub-id="${esc(sub._id)}">`;
    h += `</div>`;
    h += `<button class="dt-btn proc-add-st-submit-btn" data-sub-id="${esc(sub._id)}">Add</button>`;
    h += `</div>`;
    ```

- [ ] Task 5: Wire the Add ST Action type selector to show/hide sorcery vs other fields (AC: 5)
  - [ ] After existing `.proc-add-st-toggle-btn` wiring (~line 4725), add a change listener:
    ```js
    container.querySelectorAll('.proc-add-st-type').forEach(sel => {
      const row = sel.closest('.proc-add-st-action-row');
      if (!row) return;
      const updateVisibility = () => {
        const isSorc = sel.value === 'sorcery';
        row.querySelector('.proc-add-st-sorc-fields').style.display  = isSorc ? '' : 'none';
        row.querySelector('.proc-add-st-other-fields').style.display = isSorc ? 'none' : '';
      };
      sel.addEventListener('change', updateVisibility);
      updateVisibility(); // run on render
    });
    ```

- [ ] Task 6: Update the Submit handler to use rite/tradition for sorcery type (AC: 6)
  - [ ] Find `proc-add-st-submit-btn` click handler (~line 4739)
  - [ ] Replace with:
    ```js
    container.querySelectorAll('.proc-add-st-submit-btn').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const subId = btn.dataset.subId;
        const row = container.querySelector(`.proc-add-st-action-row[data-sub-id="${subId}"]`);
        if (!row) return;
        const actionType = row.querySelector('.proc-add-st-type').value;
        let label, description = '', tradition = '', riteName = '';
        if (actionType === 'sorcery') {
          riteName  = row.querySelector('.proc-add-st-rite').value.trim();
          tradition = row.querySelector('.proc-add-st-tradition').value.trim();
          if (!riteName) { row.querySelector('.proc-add-st-rite').focus(); return; }
          label = riteName;
        } else {
          label       = row.querySelector('.proc-add-st-label').value.trim();
          description = row.querySelector('.proc-add-st-desc').value.trim();
          if (!label) { row.querySelector('.proc-add-st-label').focus(); return; }
        }
        await addStAction(subId, { action_type: actionType, label, description, tradition, rite_name: riteName });
        stActionAddExpandedSubs.delete(subId);
        renderProcessingMode(container);
      });
    });
    ```

## Dev Notes

### Why extending isSorcery works

`renderActionPanel` branches on `isSorcery` in all the right places:
- Two-column layout wrapper (line 6238) — gated on `isSorcery`, now applied to ST sorcery
- Details card (tradition/rite/targets/notes edit mode, line 6391) — gated on `isSorcery`
- Connected characters (line 6454) — gated on `isSorcery`
- Right panel call (line 6975) — passes `sorcChar` + `sorcSub`, which are `isSorcery ? entryChar : null`
- Status buttons (line 6849) — existing `isSorcery` condition; now ST sorcery gets sorcery buttons

The review object is stored in `st_actions_resolved[idx]` (via the existing `st_created` branch of `getEntryReview`). All `rev.sorc_*` fields — tradition, rite, targets, notes — are written into this object via existing `saveEntryReview` → `st_created` handler. No save path changes needed.

### Sorcery rendering reads from entry.tradition

The sorcery right panel (`_renderSorceryRightPanel`) checks `entry.tradition === 'Cruac'` to show Mandragora Garden. This is populated from `stAction.tradition` in Task 2. On initial add, `tradition` comes from the form (Task 6). The edit mode in the left panel can also update `rev.sorc_tradition` — but `_renderSorceryRightPanel` reads `entry.tradition`, not `rev.sorc_tradition`. After an edit, the tradition change doesn't propagate to the right panel until the page re-renders from a save.

**Note for implementation:** Check whether `_renderSorceryRightPanel` should also read `rev.sorc_tradition ?? entry.tradition` for the Cruac check, to honour ST-edited tradition changes immediately.

### The label for the Delete button

The `st_created` check at the bottom of `renderActionPanel` (line 6984 — shows "Delete action" button) is a separate `source === 'st_created'` check, not an `isSorcery` check. This already works correctly — ST sorcery entries still show the delete button.

### What remains unchanged

- Player-submitted sorcery actions: `entry.source === 'sorcery'` — unchanged
- Review storage: `st_actions_resolved[idx]` — unchanged
- `addStAction` schema: existing entries without `tradition`/`rite_name` are backwards-compatible (empty strings)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

- `public/js/admin/downtime-views.js`
- `tests/downtime-processing-dt-fixes.spec.js`
- `specs/stories/dts.1.st-sorcery-full-panel.story.md`
