# Story DT-Fix-4: Sort Within Phase — Projects Before Merits

## Status: ready-for-dev

## Story

**As an** ST processing a downtime cycle,
**I want** projects to appear before merit actions within each phase,
**so that** the queue is logically ordered — project rolls (which often set the ambience context) come before merit rolls that may depend on them.

## Background

The action queue (`_buildQueue` in `downtime-views.js`) sorts entries by phase number, then by character name. Within a single phase, projects and merit actions are interleaved in insertion order. Adding a secondary sort key (source type) makes project entries consistently appear before merit entries within the same phase.

---

## Current Sort (line ~2071)

```js
queue.sort((a, b) => {
  if (a.phaseNum !== b.phaseNum) return a.phaseNum - b.phaseNum;
  return a.charName.localeCompare(b.charName);
});
```

---

## Required Change

**File:** `public/js/admin/downtime-views.js`
**Location:** `_buildQueue()` sort call (~line 2071)

Add a `source` sort tier between `phaseNum` and `charName`:

```js
const SOURCE_ORDER = { project: 0, sorcery: 1, merit: 2, feeding: 3 };

queue.sort((a, b) => {
  if (a.phaseNum !== b.phaseNum) return a.phaseNum - b.phaseNum;
  const sa = SOURCE_ORDER[a.source] ?? 9;
  const sb = SOURCE_ORDER[b.source] ?? 9;
  if (sa !== sb) return sa - sb;
  return a.charName.localeCompare(b.charName);
});
```

`SOURCE_ORDER` can be declared as a `const` just above the sort call — no need to hoist it to module scope.

---

## Acceptance Criteria

1. Within each phase, project actions appear before sorcery, merit, and feeding actions.
2. Within each source type, character-name alphabetical order is preserved.
3. Cross-phase ordering (phaseNum ascending) is unchanged.
4. Actions with an unknown source (edge case) sort last within their phase.

---

## Tasks / Subtasks

- [ ] Task 1: Update queue sort in `_buildQueue()`
  - [ ] Add `SOURCE_ORDER` const above the sort call
  - [ ] Add source sort tier between phaseNum and charName

- [ ] Task 2: Manual verification
  - [ ] Load DT Processing with a cycle that has both project and merit actions in the same phase
  - [ ] Confirm projects render before merits within the phase
  - [ ] Confirm character order within project group and merit group is still alphabetical

---

## Dev Notes

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Modify `_buildQueue()` sort call — add source tier |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/js/admin/downtime-views.js`
