# Story DTX.8: DT Story Free Text Field

Status: complete

## Story

As a Storyteller authoring a downtime narrative,
I want a free-text notes area for each player in the DT Story panel,
so that I can add contextual content, plot hooks, or ST observations that don't belong inside any specific form section.

## Acceptance Criteria

1. Each character's view in the DT Story panel has a free-text textarea below all form sections and above the sign-off panel, labelled "ST Notes".
2. The field is not tied to any submission section and has no completion status — it does not affect the sign-off counter.
3. Content is saved to `st_narrative.general_notes` (string) via the existing `saveNarrativeField` mechanism on blur.
4. On load, any existing `st_narrative.general_notes` value is pre-populated into the textarea.
5. A save-status indicator ("Saved" / "Save failed") appears inline near the textarea, consistent with other save indicators in the panel.
6. The field is visible and editable regardless of whether the narrative is locked (`stNarrative.locked`). When locked, it is still editable (notes are never locked out).
7. The textarea grows with content (min-height consistent with other response textareas in the panel).

## Tasks / Subtasks

- [ ] Task 1: Render the free-text area in `renderCharacterView` (AC: 1, 2, 4, 7)
  - [ ] In `public/js/admin/downtime-story.js`, in `renderCharacterView`, after the sections loop and before `renderSignOffPanel`, insert `renderGeneralNotes(sub)`.
  - [ ] `renderGeneralNotes(sub)` returns a `<div class="dt-story-general-notes">` block containing: a `<label>` "ST Notes", a `<textarea id="dt-story-notes-ta">` pre-populated with `sub.st_narrative?.general_notes || ''`, and a `<span id="dt-story-notes-status" class="dt-story-save-status"></span>`.

- [ ] Task 2: Wire blur-save via event delegation (AC: 3, 5)
  - [ ] In the event delegation block in `initDtStory` (the `panel.addEventListener('input', ...)` / click handler region), add a `blur` listener on `#dt-story-notes-ta` using event delegation on the panel: `e.target.closest('#dt-story-notes-ta')`.
  - [ ] On blur: read `e.target.value`, call `saveNarrativeField(_currentSub._id, { 'st_narrative.general_notes': value })`, update `_currentSub.st_narrative.general_notes = value`, show "Saved" / "Save failed" on `#dt-story-notes-status`.
  - [ ] Use `{ once: false }` — blur fires per interaction, not once.
  - [ ] Note: the main delegation listener uses `focusout` (bubbles) not `blur` (doesn't bubble) — use `focusout` or add a dedicated `addEventListener('focusout', ...)` on the panel filtered to `#dt-story-notes-ta`.

- [ ] Task 3: CSS (AC: 7)
  - [ ] In `public/css/admin-layout.css`, add `.dt-story-general-notes` block: padding consistent with other story sections (`16px`), border-top `1px solid var(--bdr)`.
  - [ ] Add `.dt-story-general-notes label`: `font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--txt3); display: block; margin-bottom: 6px;`.
  - [ ] Add `.dt-story-notes-ta`: same styles as `.dt-story-response-ta` — full width, min-height 120px, resize vertical, matching font and background.

## Dev Notes

### Key files

- `public/js/admin/downtime-story.js` — all changes here
  - `renderCharacterView` at line ~1005: add `renderGeneralNotes(sub)` call between sections loop and `renderSignOffPanel`
  - `initDtStory` event delegation block at line ~140: add `focusout` handler for `#dt-story-notes-ta`
- `public/css/admin-layout.css` — CSS additions only, append near other `.dt-story-*` rules (~line 6534+)

### Save pattern to follow

Every other narrative field uses `saveNarrativeField(submissionId, patch)` on button click. This field uses blur instead (no save button needed — it's a scratchpad). Pattern:

```js
// In focusout delegation:
const notesTa = e.target.closest('#dt-story-notes-ta');
if (notesTa) {
  const value = notesTa.value;
  const statusEl = document.getElementById('dt-story-notes-status');
  try {
    await saveNarrativeField(_currentSub._id, { 'st_narrative.general_notes': value });
    if (!_currentSub.st_narrative) _currentSub.st_narrative = {};
    _currentSub.st_narrative.general_notes = value;
    if (statusEl) { statusEl.textContent = 'Saved'; setTimeout(() => { if (statusEl) statusEl.textContent = ''; }, 2000); }
  } catch {
    if (statusEl) statusEl.textContent = 'Save failed';
  }
  return;
}
```

### Schema

`st_narrative.general_notes` is a plain string. No schema change needed — `downtimeSubmissionSchema` has `additionalProperties: true` on nested objects. The field is added to `downtime_submission.schema.js`'s `stNarrativeSchema` for documentation purposes only (no enforcement impact).

### Sign-off counter

Do NOT include `general_notes` in `isSectionDone`, `getApplicableSections`, or the progress tracker. It is intentionally invisible to the completion system.

### Locking behaviour

Unlike all other narrative fields, this textarea must remain editable when `stNarrative.locked === true`. Do not add a `disabled` attribute when locked. The rationale: ST notes are a scratchpad, not part of the publishable narrative, and may need updates after sign-off.

### Existing textarea pattern reference

`.dt-story-response-ta` in `admin-layout.css` is the canonical textarea style. Mirror those rules exactly for `.dt-story-notes-ta`.

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes List

### File List
