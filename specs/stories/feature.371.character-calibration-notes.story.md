# Story feature.371: DT Story — per-character ST calibration notes injected into prompts

**Story ID:** feature.371
**Epic:** DT Story tab improvements
**Status:** done
**Date:** 2026-05-18
**Issue:** [#371](https://github.com/angelusvmorningstar/TerraMortis/issues/371)
**Branch:** ms/issue-371-character-calibration-notes

---

## User Story

As an ST using the DT Story tab, I want to write and save per-character calibration notes — voice, tone, recurring motifs — that are automatically injected into every context prompt for that character, so that I do not have to re-enter the same guidance every time I copy context.

---

## Background

### Problem: repeated per-character guidance

Every narrative for a given character requires consistent voice calibration. For example: "René writes in a formal, slightly archaic French-influenced cadence. Never use contractions. His metaphors draw on viniculture." This guidance currently has to be typed into the ST directives field on every project card for every cycle, or the ST must maintain it externally.

The DT Story tab already has a general-purpose `st_narrative.general_notes` field and textarea (rendered via `renderGeneralNotes`, line 1134). This is per-submission (per-cycle), not per-character.

What is needed is a **per-character** calibration store that persists across cycles and is injected into prompts automatically.

### Where to store calibration notes

The character document (`characters` collection) is the correct place for character-level calibration data — it is fetched at tab open into `_allCharacters` and already referenced in `getCharForSub`. Adding a `dt_story_calibration` field to the character document keeps the data co-located with the character, not the submission.

**Schema addition:** `character.dt_story_calibration` — string, optional. Free-form ST notes about how to write narrative for this character. Stored via PATCH `/api/characters/:id`.

### Where to display the editor

The Story Moment section is the most character-focused section and the natural home for per-character settings. Add a collapsible "Voice calibration" block at the top of the Story Moment section (before the format selector), similar to the existing context-block pattern.

Alternatively, add it to the character view header area (`renderCharacterView`) so it is visible at all times regardless of which section is active. The header area approach is preferred — it keeps calibration editing outside the section-specific UI flow.

---

## Acceptance Criteria

- [x] At the top of `renderCharacterView` (above sections), there is a collapsible "Voice calibration" panel containing a textarea pre-filled with `char.dt_story_calibration || ''` and a "Save Calibration" button
- [x] Clicking "Save Calibration" PATCHes `/api/characters/:id` with `{ dt_story_calibration: <text> }` and updates `_allCharacters` in memory
- [x] `buildLetterContext`, `buildTouchstoneContext`, and `buildProjectContext` include the calibration block immediately after the character ident line: `Voice calibration:\n<text>` — only when `char.dt_story_calibration` is non-empty
- [x] `buildPatrolContext`, `buildMaintenanceContext`, and `buildCacophonySavvyContext` also inject the calibration block in the same position
- [x] The calibration textarea auto-resizes on input (use `rows="3"` with CSS `resize: vertical`)
- [x] Saving calibration does NOT re-render the entire character view — only the save button's text changes briefly to "Saved"

---

## Implementation

### `server/schemas/character.schema.js`

Add `dt_story_calibration` to the character schema as an optional string:

```js
dt_story_calibration: { type: String, default: undefined },
```

### `public/js/admin/downtime-story.js`

#### 1. Calibration panel in `renderCharacterView` (line ~1106)

Add before the sections loop:

```js
function renderCharacterView(char, sub) {
  const stNarrative = sub?.st_narrative;
  const sections = getApplicableSections(char, sub);
  const charId = String(char?._id || '');

  let h = `<div class="dt-story-char-content">`;

  // Progress tracker
  h += renderProgressTracker(char, sub);

  // Voice calibration panel (new)
  const calText = char?.dt_story_calibration || '';
  h += `<div class="dt-story-calibration-panel">`;
  h += `<div class="dt-story-calibration-header" role="button" data-toggle="calibration">`;
  h += `<span class="dt-story-section-label">Voice calibration</span>`;
  h += `<span class="dt-story-calibration-toggle-hint">${calText ? '(saved)' : '(none)'}</span>`;
  h += `</div>`;
  h += `<div class="dt-story-calibration-body${calText ? '' : ' hidden'}" data-char-id="${charId}">`;
  h += `<textarea class="dt-story-calibration-ta" rows="3" placeholder="Voice, tone, recurring motifs for this character across all prompts…">${esc(calText)}</textarea>`;
  h += `<button class="dt-story-calibration-save-btn" data-char-id="${charId}">Save Calibration</button>`;
  h += `<span class="dt-story-calibration-status"></span>`;
  h += `</div>`;
  h += `</div>`;

  // Sections
  for (const section of sections) { ... }
  // ...
```

#### 2. Calibration save handler

Add a new async handler called by the delegated event listener:

```js
async function handleCalibrationSave(btn) {
  const charId = btn.dataset.charId;
  if (!charId) return;
  const panel = btn.closest('.dt-story-calibration-body');
  const ta    = panel?.querySelector('.dt-story-calibration-ta');
  const text  = ta?.value || '';
  const status = panel?.querySelector('.dt-story-calibration-status');

  btn.disabled = true;
  if (status) status.textContent = 'Saving…';
  try {
    await apiPatch(`/api/characters/${charId}`, { dt_story_calibration: text });
    // Update in-memory character record
    const c = _allCharacters.find(c => String(c._id) === charId);
    if (c) c.dt_story_calibration = text;
    if (status) status.textContent = 'Saved';
    btn.disabled = false;
    setTimeout(() => { if (status) status.textContent = ''; }, 2000);
  } catch (err) {
    if (status) status.textContent = 'Error';
    btn.disabled = false;
    console.error('Calibration save failed:', err);
  }
}
```

Wire into the existing `click` event delegation block (where `handleCopyProjectContext`, `handleCopyCacophonyContext`, etc. are dispatched).

#### 3. Inject calibration into all context builders

Add a shared helper:

```js
function _calibrationBlock(char) {
  const cal = char?.dt_story_calibration?.trim();
  if (!cal) return [];
  return ['', 'Voice calibration (apply throughout):', cal];
}
```

Call it in each builder immediately after the ident line:

```js
// In buildProjectContext, buildPatrolContext, buildMaintenanceContext,
// buildLetterContext, buildTouchstoneContext, buildCacophonySavvyContext:
const identLine = _charIdentLine(char);
if (identLine) lines.push(identLine);
lines.push(..._calibrationBlock(char));   // ← new line, same position in all builders
```

For `buildCacophonySavvyContext` which uses a different opening structure, add it after the `Cacophony Savvy:` line.

#### 4. CSS for calibration panel (`public/css/admin-layout.css`)

```css
/* === DT STORY: Calibration panel === */
.dt-story-calibration-panel {
  margin-bottom: 1rem;
  border: 1px solid var(--surf3);
  border-radius: 4px;
}
.dt-story-calibration-header {
  padding: 0.4rem 0.75rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: var(--surf2);
}
.dt-story-calibration-toggle-hint {
  font-size: 0.75rem;
  color: var(--text-dim);
}
.dt-story-calibration-body {
  padding: 0.5rem 0.75rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.dt-story-calibration-body.hidden { display: none; }
.dt-story-calibration-ta {
  width: 100%;
  box-sizing: border-box;
  resize: vertical;
  min-height: 4rem;
  background: var(--surf1);
  color: var(--text);
  border: 1px solid var(--surf3);
  border-radius: 3px;
  padding: 0.4rem;
  font-family: inherit;
  font-size: 0.85rem;
}
.dt-story-calibration-save-btn {
  align-self: flex-start;
}
.dt-story-calibration-status {
  font-size: 0.8rem;
  color: var(--gold2);
}
```

Wire the panel toggle: clicking `.dt-story-calibration-header` toggles `.dt-story-calibration-body.hidden`.

---

## Files to Change

| File | Change |
|---|---|
| `public/js/admin/downtime-story.js` | Add calibration panel to `renderCharacterView`; add `handleCalibrationSave`; add `_calibrationBlock` helper; inject into all 6 context builders; wire delegated event handler |
| `public/css/admin-layout.css` | Add `dt-story-calibration-*` CSS block |
| `server/schemas/character.schema.js` | Add `dt_story_calibration` optional string field |

No API route changes required — existing PATCH `/api/characters/:id` handles arbitrary field patches via `$set`.

---

## Dev Notes

- Verify that the PATCH `/api/characters/:id` endpoint accepts `dt_story_calibration` without schema rejection. The character schema must have the field before deploying.
- `_allCharacters` is module-level and shared across all session characters. Updating in memory via `c.dt_story_calibration = text` means the updated value is used immediately in subsequent Copy Context clicks without a page reload.
- The calibration panel collapse state is DOM-only (hidden class toggle) — it does not need to be persisted.
- Do not add `dt_story_calibration` to the character sheet editor (`sheet.js`) — this field is exclusively for ST use in the DT Story tab.

---

## Dev Agent Record

### Completion Notes

All six ACs were already implemented from a prior session. Verified across three files:

**`public/js/admin/downtime-story.js`:**
- `_calibrationBlock` helper: line 638 — returns `['', 'Voice calibration (apply throughout):', cal]` or `[]`
- Calibration panel rendered in `renderCharacterView`: lines 1400-1413 — collapsible, pre-filled textarea, Save button, hint text
- `handleCalibrationToggle`: line 4096 — DOM-only hidden class toggle
- `handleCalibrationSave`: line 4102-4120 — PATCH to `/api/characters/:id`, in-memory update, "Saved" flash, no re-render
- Event delegation wired at lines 266-271
- All 6 builders call `_calibrationBlock(char)` after ident line: buildProjectContext(692), buildMaintenanceContext(885), buildPatrolContext(934), buildLetterContext(1739), buildTouchstoneContext(1814), buildCacophonySavvyContext(3434); feeding builder also at 4483

**`server/schemas/character.schema.js`:** line 80 — `dt_story_calibration: { type: ['string', 'null'] }`

**`public/css/admin-layout.css`:** lines 10101-10159 — full calibration panel CSS block with `resize: vertical` on textarea

No code changes needed. Story closed.

### Change Log

- 2026-06-07: Verified all ACs satisfied across all three files from prior session. No code changes. Story closed.
