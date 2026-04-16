# Story DT-Fix-27: DT Story — Taller Narrative Textarea

Status: ready-for-dev

## Story

As an ST writing downtime narratives,
I want the response textarea in each story card to be taller by default,
so that I can write and review narrative text without constantly scrolling inside a tiny box.

## Background

The narrative response textarea (`.dt-story-response-ta`) currently has no `min-height` set in CSS, so its height is controlled entirely by the `rows` attribute on the `<textarea>` element — which is set to `rows="4"` for project cards and `rows="5"` for letter/touchstone cards. This renders as approximately 80–100px tall, which is too small for writing prose narratives. The textarea is `resize: vertical` so the ST can drag it taller, but it snaps back to the small default on every re-render (i.e., every Save Draft).

## Acceptance Criteria

1. `.dt-story-response-ta` has a `min-height` of `160px` in CSS.
2. The `rows` attribute on all `<textarea class="dt-story-response-ta">` elements in `downtime-story.js` is removed or set to a value that is not smaller than the CSS min-height would render (i.e., the CSS governs the height, not the HTML attribute).
3. The textarea still has `resize: vertical` so the ST can expand it further for long narratives.
4. The change applies uniformly to all sections that use `.dt-story-response-ta`: project cards, letter from home, touchstone, and any other sections using the same class.

## Tasks / Subtasks

- [ ] Task 1: CSS — add `min-height: 160px` to `.dt-story-response-ta` (AC: 1, 3)
  - [ ] In `public/css/admin-layout.css`, find `.dt-story-response-ta` (around line 6811) and add `min-height: 160px;`
  - [ ] Verify `resize: vertical` is already present (it is — no change needed)

- [ ] Task 2: HTML — remove the `rows` attribute from all `.dt-story-response-ta` textareas (AC: 2)
  - [ ] In `public/js/admin/downtime-story.js`, search for all `<textarea class="dt-story-response-ta"` occurrences and remove the `rows="N"` attribute from each
  - [ ] Affected locations:
    - `renderProjectCard` (~line 1187): `rows="4"`
    - `renderLetterFromHome` (~line 1373): `rows="5"`
    - `renderTouchstone` (~line 1478): `rows="5"`
    - Any other sections using `.dt-story-response-ta` (grep to confirm)

## Dev Notes

### File locations

| File | Change |
|------|--------|
| `public/css/admin-layout.css` | Add `min-height: 160px` to `.dt-story-response-ta` |
| `public/js/admin/downtime-story.js` | Remove `rows="N"` from all `.dt-story-response-ta` textareas |

### Why remove `rows`

The `rows` attribute sets the intrinsic height before CSS is applied. When the CSS `min-height` is larger than what `rows` renders (which it will be at 160px), `rows` is irrelevant but adds confusion. Removing it keeps the CSS as the single source of truth for height.

### Revision textarea

`.dt-story-revision-ta` (the "Needs Revision" note textarea) is a different class and a different purpose — it should stay at its current height (`rows="2"`). Do not change it.

---

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
