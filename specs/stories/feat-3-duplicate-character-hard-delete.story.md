---
id: feat.3
epic: feat
status: ready-for-dev
priority: medium
depends_on: []
---

# Story FEAT-3: Hard-Delete Character with Cascade

As a Storyteller,
I want to permanently remove a character from the database — including all of their downtime submissions, attendance entries, and player-link references —,
So that duplicate or erroneously-created characters (e.g. the duplicate Lady Julia entry from DT2) can be fully cleaned up rather than just retired.

---

## Context

### What already exists

The DELETE endpoint **exists** at `server/routes/characters.js:408-417`:

```js
// DELETE /api/characters/:id — ST only
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
  const result = await col().deleteOne({ _id: oid });
  if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
  res.status(204).end();
});
```

**Two gaps:**
1. **No cascade.** The character is removed but related documents in `downtime_submissions`, `game_sessions` (attendance arrays), `tracker_state`, `players.character_ids`, and any other collection that references the character id are left as orphans.
2. **No admin UI.** The only way to invoke the route today is via curl / Postman. There is no button anywhere in admin.html that calls it.

This story closes both gaps.

### Distinction from "retire"

The existing `retired: true` flag is a soft-delete (character hidden from default views, kept in DB for history). FEAT-3 is a **hard-delete** — irreversible, fully removes the character and all references. Two different needs:

- **Retire** = "this character is no longer played but is part of chronicle history".
- **Hard-delete** = "this character should never have existed; remove all trace".

The use case from the epic file: duplicate Lady Julia entry from DT2.

### Files in scope

- **`server/routes/characters.js`** — extend the DELETE handler with cascade logic.
- **`public/js/admin/character-editor.js`** (or wherever the character edit panel lives) — add a "Hard-Delete Character" button gated behind a confirmation modal.
- **Audit log** (optional, see Open decision) — record who deleted what and when.

### Collections that must be cascaded

Audited from grep + memory `reference_mongodb_arch`:

| Collection | Reference field | Action |
|---|---|---|
| `downtime_submissions` | `character_id` | Delete all docs where this matches. |
| `game_sessions` | attendance array entries with `character_id` (verify exact shape) | Remove entries from each session's attendance array. |
| `tracker_state` | character-keyed entries | Remove. |
| `players` | `character_ids` array | Pull this character's id from any player's array. |
| `npcs` | `linked_character_ids` (per NPC schema, NPCR epic) | Pull from arrays; do not delete the NPC. |
| `ordeal_submissions` | `character_id` | Delete all docs where this matches. |
| `questionnaire_responses` | `character_id` | Delete all docs where this matches. |
| `histories` | `character_id` | Delete the history doc. |

**Verify the actual list** via `Glob server/schemas/*.schema.js` + `Grep character_id` before implementation. Some of these may not exist or use different field names.

### Out of scope

- A "Duplicate Character" feature (the epic title mentions both; this story is hard-delete only). Duplicate-character-creation is a separate story if needed.
- An undo / restore mechanism. Hard-delete is irreversible by design.
- Bulk delete (multiple characters at once). One character at a time.
- Audit log infrastructure if none exists. If there's no audit-log collection today, skip the audit-log step in v1; flag as a follow-up.

---

## Acceptance Criteria

### API — cascade

**Given** an ST sends `DELETE /api/characters/<id>`
**When** the handler runs
**Then** the character document is deleted from `characters`.
**And** every `downtime_submissions` document with `character_id === <id>` is deleted.
**And** every `game_sessions` document's attendance array has entries with `character_id === <id>` removed via `$pull`.
**And** every `tracker_state` entry keyed to this character is removed.
**And** every `players` document's `character_ids` array has `<id>` removed via `$pull`.
**And** every `npcs` document's `linked_character_ids` array has `<id>` removed via `$pull` (the NPC itself is not deleted).
**And** every other collection auditable via the §Verify step has its references cleaned up.

### API — atomicity

**Given** the cascade involves multiple collection writes
**Then** the writes happen in a defined order: cascade-deletes first, character delete last. If any cascade write fails, return 500 with a clear error message identifying which collection failed.
**And** the character document is **not** deleted until all cascades succeed.

(Note: MongoDB atlas multi-document transactions are available but heavyweight. v1 uses sequential writes with the character delete last as the "completion marker"; if a cascade fails the character remains and the ST can retry.)

### API — auth

**Given** a non-ST user attempts `DELETE /api/characters/<id>`
**Then** the request is rejected with 403 (existing `requireRole('st')` middleware).

### Admin UI — button placement

**Given** an ST viewing the character edit panel
**Then** a "Hard-Delete Character" button is visible at the bottom of the panel, in a clearly destructive visual style (red text, red border, or similar; reuse existing destructive-button styling if any).
**And** the button is **separate from** the existing Retire toggle — they are not the same control.

### Admin UI — confirmation gate

**Given** the ST clicks "Hard-Delete Character"
**Then** a confirmation modal appears with:
- The character's display name and id.
- A summary of what will be deleted: "X downtime submissions, Y game sessions affected, Z player links removed".
- A free-text "type the character's name to confirm" input.
- A primary "Delete permanently" button (disabled until name matches) and a "Cancel" button.

**Given** the ST types the matching name and clicks "Delete permanently"
**Then** the API DELETE call fires.
**And** on success, the modal closes and the admin grid refreshes (the character disappears from the list).
**And** on failure, the modal shows the error message and remains open.

**Given** the ST clicks "Cancel" or the typed name doesn't match
**Then** nothing is deleted.

### Confirmation summary accuracy

**Given** the modal renders its "X submissions, Y sessions, Z links" summary
**Then** the counts are fetched live (a small `GET /api/characters/<id>/cascade-preview` endpoint returning counts) — not stale guesses.
**And** if the preview endpoint fails, the modal still renders but shows "Cascade preview unavailable; proceed with caution".

### Test against duplicate Lady Julia

**Given** the duplicate Lady Julia character exists in production
**When** the ST hard-deletes that record
**Then** the duplicate is gone from the characters grid.
**And** the duplicate's DT2 attendance entry is gone from the relevant `game_sessions` doc.
**And** the duplicate's DT2 submission (if any) is gone from `downtime_submissions`.
**And** the *real* Lady Julia (the one to keep) is unaffected.

### No regressions

**Given** other characters exist
**Then** no other character data is affected by the delete.
**And** the existing Retire toggle continues to work for soft-delete.

---

## Implementation Notes

### Cascade implementation strawman

In `server/routes/characters.js` DELETE handler:

```js
router.delete('/:id', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR', message: 'Invalid character ID format' });
  const db = req.app.locals.db;

  try {
    // Cascade deletes first (sequential; bail on first failure)
    await db.collection('downtime_submissions').deleteMany({ character_id: oid });
    await db.collection('ordeal_submissions').deleteMany({ character_id: oid }).catch(() => {}); // collection may not exist
    await db.collection('histories').deleteMany({ character_id: oid }).catch(() => {});
    await db.collection('questionnaire_responses').deleteMany({ character_id: oid }).catch(() => {});
    await db.collection('tracker_state').deleteMany({ character_id: oid }).catch(() => {});

    // Pulls (don't delete the parent doc)
    await db.collection('game_sessions').updateMany({}, { $pull: { attendance: { character_id: oid } } });
    await db.collection('players').updateMany({}, { $pull: { character_ids: oid } });
    await db.collection('npcs').updateMany({}, { $pull: { linked_character_ids: oid } }).catch(() => {});

    // Finally, the character itself
    const result = await db.collection('characters').deleteOne({ _id: oid });
    if (result.deletedCount === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Character not found' });
    res.status(204).end();
  } catch (err) {
    console.error('Hard-delete cascade failed:', err);
    res.status(500).json({ error: 'CASCADE_FAILED', message: err.message });
  }
});
```

Replace `req.app.locals.db` / `col()` with whatever pattern the existing routes use — verify in file at implementation.

### Cascade preview endpoint

```js
router.get('/:id/cascade-preview', requireRole('st'), async (req, res) => {
  const oid = parseId(req.params.id);
  if (!oid) return res.status(400).json({ error: 'VALIDATION_ERROR' });
  const db = req.app.locals.db;
  const [submissions, sessionsAffected, players] = await Promise.all([
    db.collection('downtime_submissions').countDocuments({ character_id: oid }),
    db.collection('game_sessions').countDocuments({ 'attendance.character_id': oid }),
    db.collection('players').countDocuments({ character_ids: oid }),
  ]);
  res.json({ submissions, sessionsAffected, players });
});
```

### Admin UI button

In `public/js/admin/character-editor.js` (or equivalent), at the bottom of the edit panel:

```html
<button class="btn-destructive" id="char-hard-delete">Hard-Delete Character</button>
```

Click handler opens a modal that fetches the cascade preview, renders the type-to-confirm input, and on submit calls the DELETE endpoint.

### Audit log (optional v1)

If an audit-log collection exists, append `{ action: 'hard_delete_character', character_id, character_name, performed_by, performed_at, cascade_counts }` after a successful delete. If no audit log exists, skip and flag as a follow-up.

### British English

UI strings: "Hard-Delete", "Delete permanently", "Type the character's name to confirm". No em-dashes.

### Manual smoke test priority

After implementation, the **first** test is the duplicate Lady Julia case from the epic. Find the duplicate's id, run the preview, then run the delete. Verify the real Lady Julia remains untouched.

---

## Files Expected to Change

- `server/routes/characters.js` — extend DELETE handler with cascade; add GET cascade-preview endpoint.
- `public/js/admin/character-editor.js` (or wherever the edit panel lives — verify with `Grep` for "retired" / "Retire" toggle) — add hard-delete button + modal.
- `public/css/admin-layout.css` — destructive button + confirmation modal styles if not already in token system.
- Possibly `server/schemas/audit_log.schema.js` if audit infrastructure exists; otherwise skip.

---

## Definition of Done

- All AC verified.
- Manual smoke test on the duplicate Lady Julia entry confirms the real entry is untouched.
- Cascade covers every collection that references `character_id` in production.
- Confirmation gate cannot be bypassed without typing the matching name.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml`: `feat-3-duplicate-character-hard-delete: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Pairs naturally with admin-side data-management work; ship whenever convenient.
- Independent of every other FEAT story.

---

## References

- `specs/epic-features.md` FEAT-3 entry — original acceptance criteria.
- `server/routes/characters.js:408-417` — current DELETE handler (no cascade).
- `memory/reference_mongodb_arch.md` — collection inventory.
- `memory/project_npcr_epic.md` — NPC `linked_character_ids` field.
- `memory/feedback_imports.md` — destructive operations: user controls when to run them, dev provides the safe path.
