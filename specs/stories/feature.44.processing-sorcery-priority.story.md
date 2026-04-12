# Story feature.44: Processing Mode — Phase 0: Sorcery/Ritual Priority

## Status: review

## Story

**As an** ST processing a downtime cycle,
**I want** all Theban Sorcery and Cruac ritual actions surfaced at the top of the processing queue before any other phase,
**so that** ritual outcomes (which can modify Attributes, Skills, and dice pools for other characters) are resolved first and their effects can be noted on dependent actions before those actions are validated.

## Background

Discovered during Downtime 2 processing: Theban Sorcery and Cruac rituals can grant temporary Attribute/Skill bonuses and pool modifiers to participating characters (e.g. the Crone Rave — "We Own the Night" — added +4 to feeding pools for five characters and granted Rote quality). These must resolve before feeding pool validation and before project pool validation for participants. Previously this was a manual discipline issue — the system had no way to enforce or even surface this ordering.

Sorcery in the submission system is a **separate section** from projects. Detection: `responses.sorcery_N_rite` is present when a character casts a ritual. The tradition (Cruac vs. Theban) is known from the character's disciplines — the gate check is `discs.Cruac || discs.Theban`.

This story depends on **feature.43** (Processing Mode Backbone) for the processing queue container, notes thread, and validation state infrastructure.

---

## Acceptance Criteria

1. The "Resolve First" section appears as the first section in the Processing Mode queue.
2. Any submission with at least one `responses.sorcery_N_rite` value (non-empty) contributes an entry to the Resolve First section — one entry per ritual slot.
3. Each ritual entry shows: character name, rite name, tradition (Cruac / Theban), targets (from `responses.sorcery_N_targets`), ST notes (from `responses.sorcery_N_notes`), and player's description.
4. Each ritual entry has the full per-action panel from feature.43: notes thread, player feedback, validation state (`Pending / Resolved / No Effect`).
5. When an ST marks a ritual as `Resolved`, an **Attach Reminder** button appears.
6. Clicking Attach Reminder opens a panel listing all other actions in the current cycle across all submissions (grouped by character). The ST can:
   - Select one or more target actions by checkbox
   - Enter a reminder text (e.g., "+4 to pool, -1 Vitae, Rote quality")
   - Click "Attach" to save
7. Each selected target action receives a visible reminder badge: `⚑ [rite name] — [reminder text]` shown at the top of that action's expanded panel.
8. The Attach Reminder panel pre-selects actions belonging to characters named in `responses.sorcery_N_targets` if those characters can be matched to submissions.
9. A ritual entry that has reminders attached shows a summary: "Reminders attached to N actions."
10. Reminder data is stored on the cycle document (not on individual submissions), so it survives submission updates.
11. If a ritual has no game effect (e.g. extended ritual with no immediate pool impact), the ST can mark it `No Effect` — no reminder is required.

---

## Data Model Changes

### New field on `downtime_cycles` document

```js
processing_reminders: [
  {
    id: string,           // uuid or timestamp-based ID
    source_sub_id: string,
    source_char_name: string,
    source_rite: string,
    source_tradition: 'Cruac' | 'Theban',
    text: string,         // e.g., "+4 to pool, -1 Vitae, Rote quality"
    created_by: string,   // ST display name
    created_at: string,   // ISO timestamp
    targets: [
      {
        sub_id: string,
        char_name: string,
        action_key: string,  // e.g. 'feeding', 'project_1', 'project_2', 'merit_1'
      }
    ],
  }
]
```

Target actions in the processing queue look up `processing_reminders` where `targets[].sub_id === subId && targets[].action_key === actionKey` to display their reminder badges.

### Sorcery review state

Sorcery resolution state (validation status, notes thread) is stored on the submission document:

```js
sorcery_review: {
  [n]: {  // n = 1, 2, 3 matching sorcery slot
    pool_status: 'pending' | 'resolved' | 'no_effect',
    notes_thread: [{ author_id, author_name, text, created_at }],
    player_feedback: string,
  }
}
```

---

## Tasks / Subtasks

- [x] Task 1: Build Resolve First section (AC: 1, 2, 3, 4)
  - [x] In `buildProcessingQueue()`, scan each submission for non-empty `responses.sorcery_N_rite` (N = 1, 2, 3)
  - [x] For each, create a queue entry tagged `phase: 'resolve_first'` with: `{ subId, charName, riteN, riteName, tradition, targets, playerNotes }`
  - [x] Tradition detection: if the character's disciplines include `Cruac` → 'Cruac'; if `Theban` → 'Theban' (matched via `charMap` by lowercased char name)
  - [x] Render each entry using the standard processing mode panel (notes thread, validation state from feature.43)
  - [x] Validation state labels for sorcery: `Pending` / `Resolved` / `No Effect` (instead of the generic `Pending / Validated / No Roll Needed`)

- [x] Task 2: Cycle-level reminder storage (AC: 10)
  - [x] `downtimeCycleSchema` has `additionalProperties: true` — no schema changes needed
  - [x] `PUT /api/downtime_cycles/:id` already accepts any fields via `$set` — no server changes needed
  - [x] `let cycleReminders = []` added as module-level var; loaded from `cycle.processing_reminders || []` in `loadCycleById()`

- [x] Task 3: Attach Reminder panel (AC: 5, 6, 7, 8, 9)
  - [x] When ritual status is `resolved`: show "Attach Reminder" button (`proc-attach-open-btn`)
  - [x] Clicking sets `attachReminderKey = entry.key`; re-render shows `_renderAttachPanel()` inline
  - [x] Panel contains: text input, scrollable grouped action list (by char), pre-checked for targets via word-overlap match
  - [x] "Attach": builds reminder object, pushes to `cycleReminders`, saves cycle via `updateCycle()`
  - [x] After saving: closes panel, shows "Reminders attached to N actions" count
  - [x] "Cancel": closes panel without saving

- [x] Task 4: Reminder badge display on target actions (AC: 7)
  - [x] `entryActionKey(entry)` helper returns `'feeding'`, `'project_N'`, or `'merit_N'`
  - [x] In `renderActionPanel`, badges rendered at top for matching `cycleReminders` entries
  - [x] Format: `⚑ [rite] ([tradition]) — [text]` with gold left-border styling

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Resolve First section, Attach Reminder panel, reminder badge render |
| `server/schemas/downtime_cycle.schema.js` | Add `processing_reminders` field |
| `server/routes/downtime.js` (or cycles route) | Accept `processing_reminders` in cycle PUT body |

### Sorcery slot iteration

```js
const slotCount = parseInt(sub.responses?.sorcery_slot_count || '0', 10);
for (let n = 1; n <= slotCount; n++) {
  const rite = sub.responses?.[`sorcery_${n}_rite`];
  if (rite) { /* add to Resolve First */ }
}
```

### Character name matching for pre-selection

`sorcery_N_targets` is free text. Use a simple word-overlap match against `sub.character_name` values across submissions. Don't fail silently — if no match found, no pre-selection, ST manually checks.

### What this story does NOT build

- Attribute/Skill dot changes from ritual outcomes — those are applied manually in the character editor (bonus dots). This story only records the ST's note about what the ritual did.
- Investigation of ritual outcomes — narrative writing is feature.46+.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Tradition detection uses `charMap` (keyed by lowercase name/moniker); falls back to 'Unknown' if char not found.
- Sorcery queue entries carry `riteName`, `tradition`, `targetsText` as dedicated fields.
- `POOL_STATUS_LABELS` constant added to handle `resolved`/`no_effect` display in row status column.
- `entryActionKey(entry)` returns null for sorcery (sources, not targets) — badge logic skips them cleanly.
- Sorcery review stored in `sub.sorcery_review[n]` on the submission document (consistent with story spec).
- `cycleReminders` loaded from `cycle.processing_reminders` on every `loadCycleById()` call.
- `attachReminderKey` cleared on cancel, confirm, and cycle switch.
- Word-overlap pre-selection splits targets text on whitespace/commas/semicolons; requires 3+ char word match to avoid false positives from short words.
- No server changes needed — `PUT /api/downtime_cycles/:id` uses `$set` on any fields; cycle schema has `additionalProperties: true`.
- Task 5 (manual verify) requires live API with sorcery submissions.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
