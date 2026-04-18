# Story DT-Fix-19: Character Selectors — Targets Checkboxes + Full Roster for Connected Characters

## Status: done

## Story

**As an** ST processing downtime actions,
**I want** the targets and connected characters lists to show all active characters as checkboxes,
**so that** I can select any character regardless of whether they submitted a downtime this cycle.

## Background

Three character selector issues in `renderActionPanel`:

**Bug 1 — Targets: multi-select dropdown instead of checkboxes**

The sorcery Targets field renders as `<select multiple size="4">` (a multi-select dropdown). The data source is already correct (`characters.filter(c => !c.retired)` — all active characters), but the interaction model is broken: the element requires Ctrl+click to multi-select, has a fixed 4-row height with a scrollbar that truncates the list, and is visually inconsistent with the checkboxes used by Connected Characters.

The fix: replace the `<select multiple>` with a scrollable checkbox list identical in structure to the Connected Characters list. The save handler must be updated to read checked checkboxes instead of `selectedOptions`.

**Bug 2 — Connected Characters: sourced from submissions only**

Connected Characters pulls its character list from `submissions.map(...)`, which only includes characters who submitted a downtime this cycle. The fix: switch the source to `characters.filter(c => !c.retired)`, sorted by `sortName(c)`, filtered to exclude the current entry's character.

**Bug 3 — Investigation Target: single-character dropdown instead of radio/checkbox**

The Investigate action type shows a `— Select —` dropdown for the single Target character. This should use the same character list (all active, non-retired) rendered as a scrollable list of radio buttons (single-select) rather than a `<select>`. Visually consistent with the Targets checkbox list; functionally single-select only.

All three changes apply to all action types that render these sections.

---

## Acceptance Criteria

1. The Targets selector in sorcery actions renders as a scrollable checkbox list, not a `<select multiple>`.
2. The Targets checkbox list is populated from `characters.filter(c => !c.retired)`, sorted by `sortName(c)`.
3. Previously saved targets are pre-checked on render (from `rev.targets` split on `, `).
4. The Targets save handler reads checked checkboxes and saves `targets` as a comma-separated string (unchanged format).
5. Connected Characters is populated from `characters.filter(c => !c.retired)` (not `submissions`), sorted by `sortName(c)`, excluding the current entry's character.
6. Previously saved connected chars are pre-checked on render (unchanged behaviour).
7. Both selectors apply across project, merit, sorcery, and st\_created action types.
8. The Investigate action type's single Target field renders as a scrollable radio-button list populated from `characters.filter(c => !c.retired)`, sorted by `sortName(c)`.
9. Previously saved investigation target is pre-selected on render (from `rev.investigate_target_char`).
10. Selecting a radio saves the single character name immediately (same save pattern as other selectors).

---

## Tasks / Subtasks

- [x] Task 1: Replace Targets `<select multiple>` with checkbox list (`downtime-views.js`)
  - [x] 1.1: In `downtime-views.js` line 6204-6213 (inside the Targets render block), replace the entire inner block:
    ```js
    // BEFORE (lines 6205-6212):
    {
      const _activeChars = characters.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
      const _selectedTargets = new Set((targetsVal || '').split(',').map(s => s.trim()).filter(Boolean));
      const _charOpts = _activeChars.map(c => {
        const n = sortName(c);
        return `<option value="${esc(n)}"${_selectedTargets.has(n) ? ' selected' : ''}>${esc(n)}</option>`;
      }).join('');
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Targets</span><select class="proc-sorc-targets-sel" data-proc-key="${esc(entry.key)}" multiple size="4">${_charOpts}</select></div>`;
    }
    ```
    with:
    ```js
    // AFTER:
    {
      const _activeChars = characters.filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)));
      const _selectedTargets = new Set((targetsVal || '').split(',').map(s => s.trim()).filter(Boolean));
      h += `<div class="proc-proj-field"><span class="proc-feed-lbl">Targets</span>`;
      h += `<div class="proc-targets-checkbox-list">`;
      for (const c of _activeChars) {
        const n = sortName(c);
        const chk = _selectedTargets.has(n) ? ' checked' : '';
        h += `<label class="proc-conn-char-lbl"><input type="checkbox" class="proc-sorc-target-chk" data-proc-key="${esc(entry.key)}" data-char-name="${esc(n)}"${chk}> ${esc(n)}</label>`;
      }
      h += `</div></div>`;
    }
    ```
  - [x] 1.2: Data source is already correct (`characters.filter(c => !c.retired)`) — no data change needed.

- [x] Task 2: Update Targets save handler (`downtime-views.js`)
  - [x] 2.1: In `downtime-views.js` lines 3578-3579, inside the `.proc-sorc-desc-save-btn` click handler, replace the two lines that read the targets selector:
    ```js
    // BEFORE (lines 3578-3579):
    const targSel    = card.querySelector('.proc-sorc-targets-sel');
    const targets    = targSel ? [...targSel.selectedOptions].map(o => o.value).join(', ') : '';
    ```
    with:
    ```js
    // AFTER:
    const targChks   = card.querySelectorAll('.proc-sorc-target-chk');
    const targets    = [...targChks].filter(c => c.checked).map(c => c.dataset.charName).join(', ');
    ```
  - [x] 2.2: No change needed to the `saveEntryReview` call below (line 3585: `sorc_targets: targets || null`) — the save key and format are unchanged.

- [x] Task 3: Fix Connected Characters data source (`downtime-views.js`)
  - [x] 3.1: In `downtime-views.js` lines 6224-6229, replace the `otherChars` derivation block:
    ```js
    // BEFORE (lines 6224-6229):
    const otherChars = [...new Set(
      submissions.map(s => {
        const ch = findCharacter(s.character_name, s.player_name);
        return ch ? (ch.moniker || ch.name) : (s.character_name || null);
      }).filter(Boolean).filter(n => n !== entry.charName)
    )].sort();
    ```
    with:
    ```js
    // AFTER:
    const otherChars = characters
      .filter(c => !c.retired)
      .map(c => sortName(c))
      .filter(n => n !== entry.charName)
      .sort();
    ```
  - [x] 3.2: The `if (otherChars.length > 0)` guard on line 6230 and all HTML below it (lines 6230-6240) remain unchanged.

- [x] Task 4: Replace Investigation Target dropdown with radio list (`downtime-views.js`)
  - [x] 4.1: In `downtime-views.js` function `_renderActionTypeRow` (starts line 5818). The Investigate Target block is at lines 5840-5849:
    ```js
    // BEFORE (lines 5840-5849):
    if (actionType === 'investigate') {
      const _invT = rev.investigate_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<select class="proc-recat-select proc-inv-char-sel" data-proc-key="${esc(key)}">`;
      h += `<option value="">\u2014 Select \u2014</option>`;
      for (const c of [...characters].sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        h += `<option value="${esc(c.name || '')}"${c.name === _invT ? ' selected' : ''}>${esc(lbl)}</option>`;
      }
      h += `</select>`;
    }
    ```
    Replace with:
    ```js
    // AFTER:
    if (actionType === 'investigate') {
      const _invT = rev.investigate_target_char || '';
      h += `<span class="proc-feed-lbl">Target</span>`;
      h += `<div class="proc-investigate-target-list">`;
      for (const c of [...characters].filter(c => !c.retired).sort((a, b) => sortName(a).localeCompare(sortName(b)))) {
        const lbl = sortName(c).replace(/\b\w/g, l => l.toUpperCase());
        const sel = c.name === _invT ? ' checked' : '';
        h += `<label class="proc-conn-char-lbl"><input type="radio" class="proc-inv-target-radio" name="proc-inv-target-${esc(key)}" data-proc-key="${esc(key)}" value="${esc(c.name || '')}"${sel}> ${esc(lbl)}</label>`;
      }
      h += `</div>`;
    }
    ```
  - [x] 4.2: In `downtime-views.js` lines 4177-4187, update the save handler. Replace the existing `.proc-inv-char-sel` handler:
    ```js
    // BEFORE (lines 4177-4187):
    // Wire investigate target character dropdown — save without re-render
    container.querySelectorAll('.proc-inv-char-sel').forEach(sel => {
      sel.addEventListener('click', e => e.stopPropagation());
      sel.addEventListener('change', async e => {
        e.stopPropagation();
        const key   = sel.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        await saveEntryReview(entry, { investigate_target_char: sel.value });
      });
    });
    ```
    with:
    ```js
    // AFTER:
    // Wire investigate target radio list — save without re-render
    container.querySelectorAll('.proc-inv-target-radio').forEach(radio => {
      radio.addEventListener('click', e => e.stopPropagation());
      radio.addEventListener('change', async e => {
        e.stopPropagation();
        const key   = radio.dataset.procKey;
        const entry = _getQueueEntry(key);
        if (!entry) return;
        await saveEntryReview(entry, { investigate_target_char: radio.value });
      });
    });
    ```
  - [x] 4.3: The save field key `investigate_target_char` is unchanged — no schema change needed.

- [x] Task 5: CSS for selectors (`admin-layout.css`)
  - [x] 5.1: Add the following rules immediately after `.proc-conn-char-lbl input[type="checkbox"]` at line 5838 in `public/css/admin-layout.css`:
    ```css
    .proc-targets-checkbox-list {
      max-height: 150px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .proc-investigate-target-list {
      max-height: 150px;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .proc-conn-char-lbl input[type="radio"] { accent-color: var(--accent); cursor: pointer; }
    ```
  - [x] 5.2: Both new containers reuse `.proc-conn-char-lbl` for label styling (same font, size, colour) — no new label class needed.

---

## Dev Notes

### Key files

- `public/js/admin/downtime-views.js` — all JS changes (8860 lines, monolithic, no imports)
- `public/css/admin-layout.css` — CSS additions after line 5838

### Confirmed locations summary

| Item | Function | Lines |
|------|----------|-------|
| Targets `<select multiple>` render | (sorcery details render block) | 6204-6213 |
| Targets save handler (reads `selectedOptions`) | `.proc-sorc-desc-save-btn` click handler | 3578-3579 |
| Connected Characters `submissions.map` | (connected chars render block) | 6224-6229 |
| Investigate Target `<select>` render | `_renderActionTypeRow` | 5840-5849 |
| Investigate Target save handler | `.proc-inv-char-sel` change handler | 4177-4187 |

### Investigate Target — field name confirmed

The existing `<select class="proc-recat-select proc-inv-char-sel">` at line 5843 saves to `rev.investigate_target_char` (confirmed at lines 5841 and 4185). The stored value is `c.name` (legal name), not `sortName(c)`. The radio button replacement must preserve this: `value="${esc(c.name || '')}"` and save `radio.value` directly.

Note: the existing dropdown iterates all `characters` (including retired). The radio list should filter to `characters.filter(c => !c.retired)` for consistency with the other two fixes, but this is a minor behavioural improvement — confirm with ST if a retired character is ever a valid investigate target.

### Sorcery Targets — save key confirmed

The save button handler at line 3581-3587 saves to `sorc_targets` (not `targets`). The `targetsVal` variable used in the render block at line 6207 must be checked for its source — ensure it reads from `rev.sorc_targets` to match what is being saved. Do not change the save key.

### Connected Characters — `sortName` vs `moniker || name`

The old code used `ch.moniker || ch.name` via `findCharacter`. The new code uses `sortName(c)` directly from the `characters` global. `sortName(c)` is defined as `c.moniker || c.name`, so the values are equivalent. The `data-char-name` attribute and the `connectedChars.includes(charN)` pre-check on line 6235 both use this same string format, so no stored data migration is needed.

### Connected Characters — `if (otherChars.length > 0)` guard

After the fix, `otherChars` will always have entries (any active non-retired character), so the `if (otherChars.length > 0)` guard on line 6230 will always pass. This is the correct behaviour — Connected Characters should always be shown for the applicable action types.

### Existing Connected Characters pattern (template for Targets)

```js
// Connected Characters render (lines 6234-6237) — mirror this for Targets:
for (const charN of otherChars) {
  const chk = connectedChars.includes(charN) ? ' checked' : '';
  h += `<label class="proc-conn-char-lbl"><input type="checkbox" class="proc-conn-char-chk" data-proc-key="${esc(entry.key)}" data-char-name="${esc(charN)}"${chk}> ${esc(charN)}</label>`;
}
```

For Targets: class is `proc-sorc-target-chk`, container is `proc-targets-checkbox-list`.

### CSS insertion point

New CSS rules go after line 5838 in `public/css/admin-layout.css`:
```
5838: .proc-conn-char-lbl input[type="checkbox"] { accent-color: var(--accent); cursor: pointer; }
       ← INSERT HERE →
5840: /* ── Attack Target ───────────────── */
```

### No test framework

Manual verification: open a sorcery action, confirm all active characters appear as checkboxes in Targets. Tick two, save, reload — confirm ticks persist. Open a merit action, confirm Connected Characters shows all non-retired characters including those without DT submissions. Open an Investigate action, confirm all characters appear as radios in Target, select one, save, reload — confirm selection persists.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- All five tasks implemented exactly per story snippets.
- Targets `<select multiple>` replaced with `.proc-targets-checkbox-list` div of `.proc-sorc-target-chk` checkboxes; save handler updated to read checked state via `querySelectorAll`.
- Connected Characters source switched from `submissions.map(...)` to `characters.filter(c => !c.retired).map(sortName)`.
- Investigate Target `<select>` replaced with `.proc-investigate-target-list` div of `.proc-inv-target-radio` radio inputs (name scoped by key); save handler updated from `.proc-inv-char-sel` to `.proc-inv-target-radio`.
- CSS rules added after line 5838 in admin-layout.css: `.proc-targets-checkbox-list`, `.proc-investigate-target-list`, `.proc-conn-char-lbl input[type="radio"]`.
- Actual line numbers in source were shifted slightly from story estimates (e.g. targets save was lines 3584-3585 not 3578-3579) but all changes located and applied correctly by content match.

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
| 2026-04-15 | 1.1 | Closed all gaps: exact line numbers, field names, before/after snippets confirmed from source | CS Agent |
