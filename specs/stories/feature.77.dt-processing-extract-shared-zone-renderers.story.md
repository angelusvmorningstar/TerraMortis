# Story feature.77: Extract Shared Zone Renderers (D2)

## Status: done

## Story

**As a** developer maintaining the DT Processing tab,
**I want** the roll card and character lookup de-duplicated into shared functions,
**so that** all panels render consistently and future changes only require one edit.

## Background

Two duplications identified:

1. **Roll card HTML** — written three times with slightly different CSS classes:
   - `_renderMeritRightPanel` — `proc-merit-roll-btn`, `proc-proj-roll-result`
   - `_renderProjRightPanel` — `proc-proj-roll-btn`, `proc-proj-roll-result`
   - `_renderSorceryRightPanel` — `proc-ritual-roll-btn`, `proc-proj-roll-result`

2. **Character lookup** — `renderActionPanel` does an identical `findCharacter` → submissions → charMap lookup four times, once for each source type (feeding, project, sorcery, merit).

This story extracts both into shared utilities. Depends on feature.76 (D1) being merged first.

---

## Acceptance Criteria

1. A function `_renderRollCard(key, roll, poolTotal, { btnClass, showReroll })` exists and returns roll card HTML using a standardised CSS class set.
2. `_renderMeritRightPanel`, `_renderProjRightPanel`, and `_renderSorceryRightPanel` all call `_renderRollCard` instead of inline roll card HTML.
3. The rendered output is visually identical to the current implementation.
4. Character lookup in `renderActionPanel` is de-duplicated: a single `const char = findCharacterForSub(sub)` (or equivalent helper) is called once at the top of the action panel rendering, and the result passed down to sub-blocks and right-panel renderers.
5. All event handlers and data attributes on roll buttons remain unchanged.

---

## Tasks / Subtasks

- [ ] Task 1: Write `_renderRollCard(key, roll, poolTotal, opts)`
  - [ ] `opts.btnClass` — the roll button CSS class (e.g. `proc-proj-roll-btn`)
  - [ ] `opts.targetSuccesses` — optional, for sorcery target display
  - [ ] Returns full roll card section HTML including panel title, roll button, result display
  - [ ] Handles: no pool (dim italic hint), no roll yet (Roll button), roll exists (Re-roll + result)

- [ ] Task 2: Replace inline roll cards in all three right-panel renderers
  - [ ] `_renderMeritRightPanel` — replace with `_renderRollCard(...)`
  - [ ] `_renderProjRightPanel` — replace with `_renderRollCard(...)`
  - [ ] `_renderSorceryRightPanel` — replace with `_renderRollCard(...)` passing `targetSuccesses: ritInfo.target`

- [ ] Task 3: De-duplicate character lookup in `renderActionPanel`
  - [ ] Identify the four lookup blocks (feeding, project, sorcery, merit)
  - [ ] Write a single lookup at the top: `const char = findCharacterForEntry(entry, submissions, characters, charMap)`
  - [ ] Remove the four individual lookup blocks

- [ ] Task 4: Manual verification
  - [ ] Roll dice on a merit, project, and sorcery action — confirm roll cards render correctly
  - [ ] Check Re-roll, exceptional, and target-successes displays
  - [ ] Confirm no character lookup regressions (character-specific modifiers still populate)

---

## Dev Notes

### Roll card output structure (reference)

```html
<div class="proc-feed-right-section proc-proj-roll-card">
  <div class="proc-mod-panel-title">Roll — N dice</div>
  <button class="{btnClass}" data-proc-key="{key}">Roll / Re-roll</button>
  <div class="proc-proj-roll-result">...</div>
</div>
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add `_renderRollCard`; refactor three right-panel renderers; de-duplicate char lookup |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (bmad-agent-sm) |
