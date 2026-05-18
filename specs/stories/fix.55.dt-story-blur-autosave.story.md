# Story fix.55: DT Story — add blur-autosave to narrative textareas

**Story ID:** fix.55
**Issue:** #354
**Issue URL:** https://github.com/angelusvmorningstar/TerraMortis/issues/354
**Branch:** ms/issue-354-blur-autosave-dt-story
**Epic:** Fixes
**Status:** review
**Date:** 2026-05-18

---

## User Story

As an ST writing narrative in DT Story, I want my typed text to persist automatically when I click or tab away from a textarea, so that I never lose unsaved content by navigating to another character or closing the panel before hitting a save button.

---

## Background

DT Story has two textarea classes used for all narrative writing:

- **`.dt-story-response-ta`** — the main narrative body (story moment, feeding narrative, project response, home report, territory report, rumours vignette, action response)
- **`.dt-story-revision-ta`** — the revision note for players (same seven section types)
- **`.dt-feed-narrative-ta`** — alias for the feeding section response (also carries `.dt-story-response-ta` in some builds; treat it as a third class to match)

Currently all save only via explicit button click ("Save Draft", "Save & Mark Complete", "Save Revision"). Navigating away before clicking discards all unsaved text.

One textarea already autosaves: `dt-story-notes-ta` (general notes) at `downtime-story.js:323–337`. That pattern (`panel.addEventListener('focusout', ...)`) is the model for this story.

DT Processing (`downtime-views.js:2219–2237`) provides a second reference: `_handleProcFieldBlur` which calls `saveEntryReview(entry, { [field]: newVal })` and shows a `.dt-autosave-status` status indicator.

---

## Acceptance Criteria

- [ ] On `blur` of any `.dt-story-response-ta` or `.dt-feed-narrative-ta`, the current text is persisted to the correct `st_narrative` sub-field without requiring an explicit button click.
- [ ] On `blur` of any `.dt-story-revision-ta`, the current revision note is persisted to the correct `revision_note` sub-field without requiring an explicit button click.
- [ ] A `.dt-story-autosave-status` indicator appears adjacent to the textarea and shows `Saving…` → `Saved` (clears after 2 s). On error it shows `Save failed` and stays.
- [ ] Autosave fires only when the textarea value has changed from the last-saved value (no spurious PUT on blur-without-edit).
- [ ] Autosave never changes a section's `status` field (draft / complete / needs_revision). Status transitions remain the exclusive responsibility of explicit save buttons.
- [ ] `dt-story-notes-ta` blur-save is not regressed.
- [ ] All six explicit save handlers (Story Moment, Feeding Narrative, Project, Home Report, Territory, Rumours, Action) are not regressed — they still save all fields including `status`.

---

## Files

Single file, two categories of change:

- `public/js/admin/downtime-story.js`

No schema, no API, no CSS (`.dt-story-autosave-status` needs no new CSS rules — inherits from `.dt-autosave-status` if that rule already exists in `public/css/admin.css`, otherwise add a minimal rule; check first).

---

## Implementation

### Overview

Add a single delegated `focusout` handler on the panel (parallel to the existing notes-ta handler at line 324). This handler matches `.dt-story-response-ta`, `.dt-feed-narrative-ta`, and `.dt-story-revision-ta`, then dispatches to a shared `_handleStoryTaBlur(ta)` function that builds the correct patch for each section type.

---

### Change 1 — `_showStoryAutosaveStatus` helper

Add near the notes-ta handler (around line 340):

```js
function _showStoryAutosaveStatus(el, state) {
  if (!el) return;
  el.dataset.state = state;
  if (state === 'saving') { el.textContent = 'Saving…'; return; }
  if (state === 'saved') {
    el.textContent = 'Saved';
    setTimeout(() => { if (el.dataset.state === 'saved') { el.textContent = ''; delete el.dataset.state; } }, 2000);
    return;
  }
  if (state === 'error') { el.textContent = 'Save failed'; }
}
```

Status element lookup: `ta.parentElement?.querySelector('.dt-story-autosave-status')`.

---

### Change 2 — `_handleStoryTaBlur` dispatcher

The function determines which section type the textarea lives in, reads the current saved value from `_currentSub.st_narrative`, no-ops if unchanged, otherwise builds and fires the patch.

**Field derivation:**
- If `ta.classList.contains('dt-story-revision-ta')` → `field = 'revision_note'`
- Otherwise → `field = 'response'`

**Section type detection and patch building:**

| Closest selector | `st_narrative` key | Patch shape | Helper |
|---|---|---|---|
| `.dt-story-proj-card[data-proj-idx]` | `project_responses` (array) | spread existing `project_responses[idx]` with `{ [field]: newVal }` | `buildUpdatedProjectResponses(sub, idx, spread)` |
| `.dt-story-merit-card[data-action-idx]` | `action_responses` (array) | spread existing `action_responses[idx]` with `{ [field]: newVal }` | `buildUpdatedArray(existing, idx, spread)` |
| `.dt-story-terr-section[data-terr-idx]` | `territory_reports` (array) | spread existing `territory_reports[idx]` with `{ [field]: newVal }` | `buildUpdatedArray(existing, idx, spread)` |
| `[data-slot-idx]` inside `cacophony_savvy` section | `cacophony_savvy` (array) | spread existing `cacophony_savvy[idx]` with `{ [field]: newVal }` | `buildUpdatedArray(existing, idx, spread)` |
| `.dt-story-section[data-section="story_moment"]` | `story_moment` (object) | `{ ...curr, [field]: newVal }` | none |
| `.dt-story-section[data-section="feeding_validation"]` | `feeding_narrative` (object) | `{ ...curr, [field]: newVal }` | none |
| `.dt-story-section[data-section="home_report"]` | `home_report` (object) | `{ ...curr, [field]: newVal }` | none |

For all cases: spread over the existing saved object — never overwrite `status`, `author`, or `format`. Those fields survive intact from the last explicit-button save.

**Cacophony Savvy slot-idx**: the slot container uses `[data-slot-idx]`. Walk up from `ta` via `ta.closest('[data-slot-idx]')` to get `idx`. The section container is `.dt-story-section[data-section="cacophony_savvy"]`.

**No-op guard**: compare `(savedField || '') === newVal.trim()` before building the patch. Use `.trim()` consistently.

**After save**: update `_currentSub.st_narrative` in-memory (mirror what explicit save handlers do).

```js
async function _handleStoryTaBlur(ta) {
  if (!_currentSub) return;
  const isRevision = ta.classList.contains('dt-story-revision-ta');
  const field      = isRevision ? 'revision_note' : 'response';
  const newVal     = ta.value.trim();

  let patch     = null;
  let memUpdate = null;

  // --- project responses ---
  const projCard = ta.closest('.dt-story-proj-card');
  if (projCard) {
    const idx      = parseInt(projCard.dataset.projIdx, 10);
    const existing = _currentSub.st_narrative?.project_responses || [];
    const curr     = existing[idx] || {};
    if ((curr[field] || '') === newVal) return;
    const updated  = buildUpdatedProjectResponses(_currentSub, idx, { ...curr, [field]: newVal });
    patch          = { 'st_narrative.project_responses': updated };
    memUpdate      = () => { (_currentSub.st_narrative ||= {}).project_responses = updated; };
  }

  // --- action responses (merit cards) ---
  else if (ta.closest('.dt-story-merit-card')) {
    const card     = ta.closest('.dt-story-merit-card');
    const idx      = parseInt(card.dataset.actionIdx, 10);
    const existing = _currentSub.st_narrative?.action_responses || [];
    const curr     = existing[idx] || {};
    if ((curr[field] || '') === newVal) return;
    const updated  = buildUpdatedArray(existing, idx, { ...curr, [field]: newVal });
    patch          = { 'st_narrative.action_responses': updated };
    memUpdate      = () => { (_currentSub.st_narrative ||= {}).action_responses = updated; };
  }

  // --- territory reports ---
  else if (ta.closest('.dt-story-terr-section')) {
    const terrSec  = ta.closest('.dt-story-terr-section');
    const idx      = parseInt(terrSec.dataset.terrIdx, 10);
    const existing = _currentSub.st_narrative?.territory_reports || [];
    const curr     = existing[idx] || {};
    if ((curr[field] || '') === newVal) return;
    const updated  = buildUpdatedArray(existing, idx, { ...curr, [field]: newVal });
    patch          = { 'st_narrative.territory_reports': updated };
    memUpdate      = () => { (_currentSub.st_narrative ||= {}).territory_reports = updated; };
  }

  // --- cacophony savvy slots ---
  else if (ta.closest('[data-slot-idx]')) {
    const slot  = ta.closest('[data-slot-idx]');
    const idx   = parseInt(slot.dataset.slotIdx, 10);
    const existing = _currentSub.st_narrative?.cacophony_savvy || [];
    const curr  = existing[idx] || {};
    if ((curr[field] || '') === newVal) return;
    const updated  = buildUpdatedArray(existing, idx, { ...curr, [field]: newVal });
    patch          = { 'st_narrative.cacophony_savvy': updated };
    memUpdate      = () => { (_currentSub.st_narrative ||= {}).cacophony_savvy = updated; };
  }

  // --- scalar sections: story_moment, feeding_narrative, home_report ---
  else {
    const section    = ta.closest('.dt-story-section');
    const sectionKey = section?.dataset.section;
    const narrativeKeyMap = {
      story_moment:       'story_moment',
      feeding_validation: 'feeding_narrative',
      home_report:        'home_report',
    };
    const narrativeKey = narrativeKeyMap[sectionKey];
    if (!narrativeKey) return;
    const curr = _currentSub.st_narrative?.[narrativeKey] || {};
    if ((curr[field] || '') === newVal) return;
    const merged = { ...curr, [field]: newVal };
    patch        = { [`st_narrative.${narrativeKey}`]: merged };
    memUpdate    = () => { (_currentSub.st_narrative ||= {})[narrativeKey] = merged; };
  }

  if (!patch) return;

  const statusEl = ta.parentElement?.querySelector('.dt-story-autosave-status');
  _showStoryAutosaveStatus(statusEl, 'saving');
  try {
    await saveNarrativeField(_currentSub._id, patch);
    memUpdate();
    _showStoryAutosaveStatus(statusEl, 'saved');
  } catch {
    _showStoryAutosaveStatus(statusEl, 'error');
  }
}
```

---

### Change 3 — Wire the handler in `initStoryPanel`

Extend the existing `focusout` block (line ~324) or add a second listener immediately after it:

```js
panel.addEventListener('focusout', async e => {
  const ta = e.target.closest('.dt-story-response-ta, .dt-feed-narrative-ta, .dt-story-revision-ta');
  if (ta) { await _handleStoryTaBlur(ta); return; }
});
```

Do **not** remove the existing notes-ta `focusout` handler — keep it intact.

---

### Change 4 — Add `.dt-story-autosave-status` spans to render functions

After each textarea in the render HTML add:
```html
<span class="dt-story-autosave-status"></span>
```

Functions to update (all in `downtime-story.js`):

| Render function | Textareas present |
|---|---|
| `renderStoryMoment` | `.dt-story-response-ta`, `.dt-story-revision-ta` |
| `renderFeedingValidation` | `.dt-feed-narrative-ta`, `.dt-story-revision-ta` |
| `_buildProjectCard` (or equivalent) | `.dt-story-response-ta`, `.dt-story-revision-ta` |
| `renderHomeReport` | `.dt-story-response-ta`, `.dt-story-revision-ta` |
| `_buildTerritorySection` (or equivalent) | `.dt-story-response-ta`, `.dt-story-revision-ta` |
| `renderCacophonySavvy` / `_buildCsSlot` | `.dt-story-response-ta`, `.dt-story-revision-ta` |
| `_buildMeritCard` (or equivalent) | `.dt-story-response-ta`, `.dt-story-revision-ta` |

Locate each textarea in the HTML builder by searching for the class name, then insert `<span class="dt-story-autosave-status"></span>` on the line immediately following.

---

### Change 5 — CSS check

Search `public/css/admin.css` for `.dt-autosave-status`. If a rule exists, add `.dt-story-autosave-status` to the same selector (or add a standalone rule with the same declarations). The indicator needs only: `font-size: 0.75rem; color: var(--gold2); margin-left: 6px;` or equivalent.

---

## Dev Notes

### Autosave does not set `status` — this is intentional

The explicit save buttons are the **only** mechanism that transitions a section between `draft`, `complete`, and `needs_revision`. The autosave patches only `response` or `revision_note`. If the ST types a narrative and blurs without saving, the section status stays as-is (typically null / absent). This is correct — the section is not "done" just because text exists.

### `buildUpdatedProjectResponses` vs `buildUpdatedArray`

`buildUpdatedProjectResponses` is a wrapper around the same pattern as `buildUpdatedArray` but also sets `project_index: idx`. Use `buildUpdatedProjectResponses` for projects; use `buildUpdatedArray` for action_responses, territory_reports, and cacophony_savvy.

### `feeding_narrative` vs `feeding_validation`

The `data-section` on the feeding section DOM node is `"feeding_validation"` (the approval gate). The `st_narrative` sub-key for the narrative textarea output is `"feeding_narrative"`. These are different. The map in Change 2 handles this: `feeding_validation` DOM key → `feeding_narrative` schema key.

### `_assertCurrentCycle` gate

`saveNarrativeField` calls `_assertCurrentCycle(submissionId)` which throws if the submission belongs to a different cycle than `_currentSub`. This is correct behaviour; the blur handler should let the error propagate to the `catch` block which shows `Save failed`.

### `.dt-feed-narrative-ta`

The feeding textarea uses `.dt-feed-narrative-ta` as its primary class (line ~1272 in the render). The `focusout` selector in Change 3 must include this class. It also carries `.dt-story-response-ta` in some code paths — verify by checking `renderFeedingValidation`. If it does, the existing class match suffices; if it doesn't, add `.dt-feed-narrative-ta` to the selector.

---

## Testing

Manual test cases (no automated test framework for this story):

1. **Response-ta autosave — Story Moment**: Type in the Story Moment response textarea, tab away (don't click Save). Reload the character. Verify text persists.
2. **Revision-ta autosave — Story Moment**: Type in the revision note textarea, tab away. Reload. Verify text persists.
3. **Status not clobbered**: Set a section to Complete via the save button. Type new text in response-ta and blur. Verify the section still shows as Complete (status dot unchanged).
4. **No-op guard**: Click into a textarea that already has saved text without changing it. Tab away. Confirm no network request fires (check DevTools Network tab for a spurious PUT).
5. **Projects**: Type in a project response-ta, blur. Reload. Verify `project_responses[idx].response` persisted. Repeat for revision-ta.
6. **Territory**: Same pattern for a territory response-ta.
7. **Rumours**: Same pattern for a cacophony savvy slot.
8. **Action responses**: Same pattern for a merit action card.
9. **Feeding narrative**: Type in the feeding narrative textarea, blur. Reload. Verify `feeding_narrative.response` persisted.
10. **Home Report**: Same pattern.
11. **Notes-ta regression**: Verify `dt-story-notes-ta` still autosaves (was working before this story).
12. **Explicit save regression**: Verify Save Draft and Save & Mark Complete still set `status` correctly.
13. **Status indicator**: Confirm `Saving…` appears on blur, transitions to `Saved`, clears after ~2 s.

---

## Tasks

- [x] T1: Add `_showStoryAutosaveStatus(el, state)` helper function
- [x] T2: Implement `_handleStoryTaBlur(ta)` dispatcher covering all 7 section types
- [x] T3: Wire `focusout` listener in `initStoryPanel` for response/feed/revision textareas
- [x] T4: Add `.dt-story-autosave-status` span to all render functions (7 section types × 2 textareas each)
- [x] T5: CSS check — extend `.dt-autosave-status` rule or add `.dt-story-autosave-status` standalone
- [ ] T6: Manual smoke test all 13 cases above on dev deploy

---

## Dev Agent Record

### Completion Notes

T1: Added `_showStoryAutosaveStatus(el, state)` — shows `Saving…` / `Saved` (clears after 2 s) / `Save failed` on the `.dt-story-autosave-status` span adjacent to the textarea. Guards against stale state via `el.dataset.state` check in the timeout.

T2: Added `_handleStoryTaBlur(ta)` dispatcher. Determines section type by walking up the DOM: `.dt-story-proj-card` → project_responses; `.dt-story-merit-card` → action_responses; `.dt-story-terr-section` → territory_reports; `[data-slot-idx]` → cacophony_savvy; `.dt-story-section[data-section]` → story_moment / feeding_narrative / home_report. Field is `revision_note` for `.dt-story-revision-ta`, `response` otherwise. No-op guard compares trimmed value against last-saved. Spreads over existing saved object so `status`, `author`, `format` survive.

T3: Added second `focusout` listener in `initStoryPanel` after the notes-ta listener. Matches `.dt-story-response-ta, .dt-feed-narrative-ta, .dt-story-revision-ta`.

T4: Added `<span class="dt-story-autosave-status"></span>` inline after each textarea in 14 locations across 7 render functions. Span is inside the same `parentElement` so `ta.parentElement.querySelector('.dt-story-autosave-status')` resolves correctly.

T5: Extended `.dt-autosave-status` CSS rule in `admin-layout.css` to include `.dt-story-autosave-status` on all four declarations (base + 3 state variants).

### File List

- `public/js/admin/downtime-story.js` (modified)
- `public/css/admin-layout.css` (modified)

### Change Log

- 2026-05-18: fix.55 — DT Story blur-autosave. Added `_showStoryAutosaveStatus` + `_handleStoryTaBlur` dispatcher covering 7 section types. Delegated `focusout` listener wired in `initStoryPanel`. Status spans added to all 14 render-function textareas. CSS rule extended. Parse-check clean.
