# Story Fix.9: Pacts Dropdown Placeholder Text

## Status: ready-for-dev

## Story

**As an** ST editing a character's pacts,
**I want** the pact add dropdown placeholder to say "-- select oath or law to add --",
**so that** it accurately reflects that the list contains both Invictus Oaths and Invictus Laws.

## Background

The pact add row in `shRenderPowers()` currently renders:

```js
// public/js/editor/sheet.js ~line 573–574
'<select id="pact-add-sel" class="gen-qual-input" style="flex:1;min-width:200px">'
+ '<option value="">-- select oath to add --</option>'
```

The `_oathDB` includes entries of type `'Invictus Oath'` and `'Invictus Law'`. The placeholder only says "oath", which is misleading when the list also contains Laws.

The button label on the same row reads `+ Add Oath` — this should also be updated to `+ Add Pact`.

## Acceptance Criteria

1. The pacts add dropdown placeholder reads `-- select oath or law to add --`
2. The add button reads `+ Add Pact` (was `+ Add Oath`)
3. No functional change — only text

## Tasks / Subtasks

- [ ] In `public/js/editor/sheet.js` around line 574, change:
  ```
  -- select oath to add --
  ```
  to:
  ```
  -- select oath or law to add --
  ```
- [ ] On line ~577, change:
  ```
  + Add Oath
  ```
  to:
  ```
  + Add Pact
  ```

## Dev Notes

- Single-file, two-string change. No logic affected.
- Confirm the pact section still renders and functions correctly after change.

---

## Dev Agent Record

### Implementation Plan
_To be filled by dev agent_

### Debug Log
_To be filled by dev agent_

### Completion Notes
_To be filled by dev agent_

## File List
_To be filled by dev agent_

## Change Log
_To be filled by dev agent_
