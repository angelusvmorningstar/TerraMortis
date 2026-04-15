# Story DT-Fix-13: ST-Created Actions in DT Interface

## Status: ready-for-dev

## Story

**As an** ST processing a downtime cycle,
**I want** to add actions on behalf of a character directly in DT Processing (e.g. Rite actions not in the player's submission),
**so that** I can resolve mechanically-necessary actions without asking players to resubmit.

## Background

Symon has multiple Rite actions that must be resolved each cycle but are not in his player submission (the player handles them as standing procedural items). Currently there is no way to add these in DT Processing — the ST must either manually track them off-system or ask the player to resubmit.

This is a medium-complexity feature requiring a design decision on where ST-created entries live in the data model and how they flow through the queue and checklist systems.

---

## Design Decisions Required

### 1. Data model

**Option A — Separate ST-created array per submission:**
```js
submission.st_actions = [
  { action_type: 'sorcery', merit_name: 'Theban Sorcery', rite: 'Rite of X', ... }
]
```

**Option B — Inject into existing resolved arrays:**
ST-created actions are stored alongside player actions in `projects_resolved` or `merit_actions_resolved` with a `source: 'st_created'` flag.

**Option C — Separate collection:**
ST-created actions stored in their own MongoDB collection, associated to the cycle and character.

**Recommendation:** Option B — inject into existing arrays with `source: 'st_created'`. This allows the queue builder to include them without new rendering paths. The `source` flag lets the UI show a visual indicator that the action was ST-created, not player-submitted.

### 2. UI entry point

Where does the ST trigger an "Add action"?

**Option A:** Button in the character's DT Processing section header
**Option B:** Button in the right-click / context menu on a queue entry
**Option C:** "Add action" row at the bottom of each character's queue section

**Recommendation:** Option C — inline "Add action" row per character, similar to how some PM tools add rows. Less modal complexity.

### 3. Action types available to ST

Limit to action types that make sense for ST-creation:
- Sorcery (Theban / Cruac rite)
- Project (ambience, patrol, etc.)
- Merit action (allies, contacts)

Feeding is not ST-created — if a character's feeding is missing, the ST uses the checklist "no submission" pathway.

### 4. Queue integration

ST-created actions appear in the queue like player actions, with a visual indicator (e.g. `[ST]` badge on the collapsed row) so the ST knows it's ST-generated.

### 5. Checklist integration

ST-created actions should count toward phase completion in the same way as player actions. The checklist "all done" check must include them.

---

## Acceptance Criteria

1. ST can add a new sorcery, project, or merit action to any character in DT Processing.
2. ST-created actions appear in the action queue with an `[ST]` badge distinguishing them from player actions.
3. ST-created actions go through the same pool/roll/status workflow as player actions.
4. ST-created actions count toward phase completion and the submission checklist.
5. ST-created actions are saved to the submission document (not local-only).
6. ST can delete an ST-created action they added in error (player actions are not deletable).

---

## Tasks / Subtasks

- [ ] Task 1: Confirm data model choice with SM — Option B recommended
- [ ] Task 2: Design "Add action" UI — inline row per character
- [ ] Task 3: Build action type selector and minimal form (type, merit/rite name, phase)
- [ ] Task 4: Wire save to inject into `merit_actions_resolved` / `projects_resolved` with `source: 'st_created'`
- [ ] Task 5: Update queue builder to include ST-created entries
- [ ] Task 6: Add `[ST]` badge to collapsed queue row for ST-created entries
- [ ] Task 7: Update checklist completion check to include ST-created entries
- [ ] Task 8: Add delete affordance for ST-created entries only
- [ ] Task 9: Manual verification — add a rite for Symon, confirm it queues, rolls, and counts toward completion

---

## Dev Notes

### Scope boundary

This story does not add a player-facing view of ST-created actions (they are ST-internal unless the ST writes a narrative response in DT Story). The DT Story tab may optionally surface ST-created actions in prompt generators — that is out of scope here.

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-views.js` | Add "Add action" UI, update queue builder, update checklist |
| `server/routes/downtime_submissions.js` | Verify PATCH endpoint accepts the new structure |
| `server/schemas/downtime_submission.schema.js` | Add `st_created: true` flag to action entry schema |

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
- `server/routes/downtime_submissions.js`
- `server/schemas/downtime_submission.schema.js`
