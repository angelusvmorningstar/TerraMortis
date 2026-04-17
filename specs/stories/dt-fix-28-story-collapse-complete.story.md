# Story DT-Fix-28: DT Story — Collapse Completed Cards

Status: complete

## Story

As an ST writing downtime narratives,
I want a toggle to collapse any section cards that are already marked complete,
so that I can focus on the remaining work without scrolling past finished sections.

## Background

The DT Story character view renders all section cards for a character — projects, merits, letter, touchstone, territory reports, cacophony, contacts, etc. Once most sections are complete, the view becomes very long and the incomplete sections are buried. There is no way to hide the finished work. A per-character collapse toggle on the character header would let the ST quickly tuck away everything marked complete and see only what remains.

## Acceptance Criteria

1. A "Collapse complete" toggle button appears in the character header row (`.dt-story-char-header`), to the right of the character name.
2. Clicking it hides the body content of all complete cards, leaving only their header rows visible — a "collapsed stub" that still identifies the section.
3. While active, the button label changes to "Show all" and gains an `.active` CSS class (gold border/text, matching other active button patterns in the UI).
4. Clicking "Show all" restores all card bodies and returns the button to "Collapse complete".
5. The collapse state is stored per-character (by `char._id`) in a module-level `Set` so it survives re-renders within the same session (i.e., Save Draft does not reset the collapse state).
6. Cards affected are all card types that carry a `.complete` class:
   - `.dt-story-proj-card.complete`
   - `.dt-story-merit-card.complete`
   - `.dt-story-cs-slot.complete`
   - `.dt-story-letter-card.complete` (or whatever wrapper class `renderLetterFromHome` uses)
   - `.dt-story-touchstone-card.complete` (or whatever wrapper class `renderTouchstone` uses)
   - Any other card-level divs in the character view that carry `.complete`
7. The "collapsed" body is hidden visually — the card outer div remains in the DOM (no removal). Only the non-header children are hidden.

## Tasks / Subtasks

- [x] Task 1: Module state — add `_collapseComplete` Set (AC: 5)
  - [x] In `public/js/admin/downtime-story.js`, near the top of the module, add:
    ```javascript
    const _collapseComplete = new Set(); // char IDs with collapse-complete active
    ```

- [x] Task 2: `renderCharacterView` — add toggle button and wrapper attribute (AC: 1, 5)
  - [x] In `renderCharacterView`, read `const collapseActive = _collapseComplete.has(String(char?._id || ''));`
  - [x] Add collapse toggle button to the char header:
    ```javascript
    h += `<button class="dt-story-collapse-toggle${collapseActive ? ' active' : ''}" data-char-id="${String(char?._id || '')}">${collapseActive ? 'Show all' : 'Collapse complete'}</button>`;
    ```
  - [x] Wrap all rendered content in a container div with the data attribute:
    ```javascript
    // Outer wrapper applied to entire character view output
    const collapseAttr = collapseActive ? ' data-collapse-complete="true"' : '';
    // Wrap the returned h string: `<div class="dt-story-char-content"${collapseAttr}>` ... `</div>`
    ```
    The `.dt-story-char-content` wrapper sits inside `#dt-story-char-view` (the element that receives `innerHTML`).

- [x] Task 3: Click handler — wire the toggle button (AC: 3, 4, 5)
  - [x] In the panel's event delegation block (`panel.addEventListener('click', ...)`), add a handler for `.dt-story-collapse-toggle`:
    ```javascript
    const collapseToggle = e.target.closest('.dt-story-collapse-toggle');
    if (collapseToggle) {
      e.stopPropagation();
      const charId = collapseToggle.dataset.charId;
      if (_collapseComplete.has(charId)) _collapseComplete.delete(charId);
      else _collapseComplete.add(charId);
      const isNowActive = _collapseComplete.has(charId);
      // Update data attribute on the content wrapper (no full re-render needed)
      const content = collapseToggle.closest('.dt-story-char-content');
      if (content) content.dataset.collapseComplete = isNowActive ? 'true' : 'false';
      // Update button state
      collapseToggle.textContent = isNowActive ? 'Show all' : 'Collapse complete';
      collapseToggle.classList.toggle('active', isNowActive);
      return;
    }
    ```

- [x] Task 4: CSS — hide non-header children of complete cards when collapse is active (AC: 2, 6, 7)
  - [x] In `public/css/admin-layout.css`, add a new block:
    ```css
    /* ── DT Story — Collapse complete cards ── */
    .dt-story-char-content[data-collapse-complete="true"] .dt-story-proj-card.complete > *:not(.dt-story-proj-header),
    .dt-story-char-content[data-collapse-complete="true"] .dt-story-merit-card.complete > *:not(.dt-story-merit-header),
    .dt-story-char-content[data-collapse-complete="true"] .dt-story-cs-slot.complete > *:not(.dt-story-cs-slot-header) {
      display: none;
    }
    ```
  - [x] Identify the outer wrapper class used by `renderLetterFromHome` and `renderTouchstone` and add corresponding rules. Check the JS for the outermost `<div class="...">` in those functions and what their header child class is.
  - [x] Collapsed complete cards should still show the header with its ✓ dot, so the ST can see what's done at a glance.

- [x] Task 5: CSS — toggle button style (AC: 3)
  - [x] Add `.dt-story-collapse-toggle` button style: small, secondary, matching the existing `.dt-story-revision-note-btn` style (ghost/outline).
  - [x] `.dt-story-collapse-toggle.active`: gold border and text (matching `--gold2`).

## Dev Notes

### Why data attribute + CSS instead of threading a flag through render functions

There are ~10+ render functions that produce card HTML. Threading a `collapseActive` boolean through all of them and conditionally rendering different HTML would require changes to every function signature and every call site. The data attribute approach lets CSS do the hiding with zero render-function changes — only the outer wrapper and the click handler need updating.

The trade-off: toggling the collapse state requires either a DOM attribute update (fast, no re-render) or a full re-render. The DOM attribute update is preferred here — it avoids visual flicker on every toggle.

### Session persistence vs page persistence

`_collapseComplete` is a JS module variable — it persists within the session but is reset on page reload. This is the correct behaviour; the ST starts each session with all cards visible.

### What "header" means per card type

| Card class | Header child to keep visible |
|---|---|
| `.dt-story-proj-card` | `.dt-story-proj-header` |
| `.dt-story-merit-card` | `.dt-story-merit-header` |
| `.dt-story-cs-slot` | `.dt-story-cs-slot-header` |
| Letter / Touchstone / other | Read the render function to find the first child div — it will be named something like `.dt-story-section-header` or a card-specific header class |

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-story.js` | `_collapseComplete` Set, `renderCharacterView` wrapper + button, click handler |
| `public/css/admin-layout.css` | Collapse CSS rules, toggle button style |

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Already implemented in a prior session; verified across both files
- `downtime-story.js` line 29: `_collapseComplete` Set declared; line 1036–1044: `collapseActive` read + wrapper attr + toggle button in `renderCharacterView`; line 158–164: click handler in event delegation block
- `admin-layout.css` lines 7248–7252: collapse CSS for proj/merit/cs-slot/section/terr-section card types; lines 7257–7269: toggle button style + `.active` gold state

### File List
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
