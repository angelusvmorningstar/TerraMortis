# Story DTX.7: Regent Feeding Confirmation Gate

Status: complete

## Story

As a player submitting my downtime,
I want the feeding section to be locked until all Regents have confirmed feeding rights for this cycle,
so that I can trust the territory roster I'm submitting against is stable and not going to change after I've acted on it.

## Acceptance Criteria

1. When a downtime cycle is in `active` status and `cycle.feeding_rights_confirmed` is not `true`, the Feeding and Territory sections in the player downtime form show a locked banner instead of their form fields. The banner explains that feeding rights are pending Regent confirmation and names any outstanding territories.
2. Once every territory with a non-null `regent_id` has submitted a feeding confirmation for the cycle, the server sets `cycle.feeding_rights_confirmed = true`. The Feeding and Territory sections immediately unlock for all players on their next form load.
3. The gate is global — partial confirmation (some Regents confirmed, some not) does not unlock the form for anyone.
4. A Regent submits their confirmation via a "Confirm Feeding Rights" button in the Regency tab. This is distinct from the existing "Save Feeding Rights" button: Save writes to the `territories` collection (live rights, used by City and DT Processing); Confirm records an append-only snapshot for this cycle in `cycle.regent_confirmations`.
5. After confirming, a Regent may update their rights by confirming again — but the new rights list must be a superset of the rights they previously confirmed for this cycle. Characters already granted rights cannot be removed. The UI disables the selects for previously confirmed characters.
6. A Regent who has not yet confirmed sees a clear call-to-action in their Regency tab indicating that the cycle feeding gate is waiting on them.
7. The ST can see confirmation status for each territory in the DT City panel — a per-territory chip showing "Confirmed" (with timestamp) or "Pending".
8. Territories with no assigned Regent (`regent_id` is null or absent) are excluded from the confirmation requirement (they do not block the gate).
9. If there are no territories with a Regent at all, the gate is considered satisfied and the feeding section is never locked.

## Tasks / Subtasks

- [ ] Task 1: Add fields to the downtime cycle document — `feeding_rights_confirmed: boolean` (default absent/false) and `regent_confirmations: [{ territory_id, regent_char_id, confirmed_at, rights: string[] }]` (default empty array). Add to `downtimeCycleSchema` in `server/schemas/downtime_submission.schema.js`.
- [ ] Task 2: Add `POST /api/downtime_cycles/:id/confirm-feeding` endpoint in `server/routes/downtime.js`. Auth: both roles (Regents are players). Body: `{ territory_id: string, rights: string[] }`. Server logic:
   1. Load the cycle; reject if not found or not `active`.
   2. Load the territory; verify the requesting user's character is the Regent (`territory.regent_id === req.user.character_id`). ST may bypass this check.
   3. Find any existing confirmation for this territory in `cycle.regent_confirmations`. If present, verify `rights` is a superset (all previously confirmed chars still present); reject with 409 and list of removed chars if not.
   4. Upsert the confirmation entry.
   5. Recompute gate: if every territory with non-null `regent_id` now has a confirmation, set `feeding_rights_confirmed = true`.
   6. Return updated cycle doc.
- [ ] Task 3: In `public/js/player/downtime-form.js`, load cycle feeding confirmation state alongside the cycle fetch. If `cycle.feeding_rights_confirmed !== true`, replace the Feeding and Territory section bodies with a locked banner. Banner text: "Feeding rights are being confirmed by Regents — this section will unlock once all territories are confirmed. Check back soon." Optionally list pending territories by name.
- [ ] Task 4: In `public/js/player/regency-tab.js`, add a "Confirm Feeding Rights" button alongside the existing "Save Feeding Rights". Wire it to `POST /api/downtime_cycles/:id/confirm-feeding`. On success, re-render the tab to reflect confirmed state. Already-confirmed character slots show a locked select (disabled) with the confirmed character pre-selected.
- [ ] Task 5: In `public/js/player/regency-tab.js`, show a call-to-action banner at the top of the Regency tab when the active cycle has `feeding_rights_confirmed !== true` and this Regent has not yet confirmed. Suppress the banner once the Regent has confirmed (check `cycle.regent_confirmations` for their territory).
- [ ] Task 6: In `public/js/admin/city-views.js`, add a per-territory confirmation status chip to the territory card display. Chip reads "Confirmed [date]" (gold, if confirmed for the active cycle) or "Pending" (muted, if not). Pull confirmation data from the active cycle doc.
- [ ] Task 7: Server API tests — `server/tests/api-downtime-regent-gate.test.js`:
   - Regent can confirm their territory's rights
   - Regent cannot remove a previously confirmed character (returns 409)
   - Regent can add additional characters after first confirmation
   - Gate remains false when one of two regents has confirmed
   - Gate becomes true when all regents have confirmed
   - Player cannot confirm a territory whose Regent they are not
   - ST can confirm on behalf of any territory (role bypass)
   - Territory with no regent_id does not block gate computation

## Dev Notes

### Data model

**Cycle document additions:**
```json
{
  "feeding_rights_confirmed": false,
  "regent_confirmations": [
    {
      "territory_id": "southside",
      "regent_char_id": "char-abc-123",
      "confirmed_at": "2026-04-17T20:00:00.000Z",
      "rights": ["char-def-456", "char-ghi-789"]
    }
  ]
}
```

`feeding_rights_confirmed` is a server-computed flag — never written by the client directly.

### Gate computation (server-side)

After each confirmation, the server queries `territories` for all docs with `regent_id` present and non-null. It then checks whether every such `territory.id` has an entry in the updated `cycle.regent_confirmations`. If yes, `$set: { feeding_rights_confirmed: true }`.

### Append-only enforcement

On confirm, find `existing = cycle.regent_confirmations.find(c => c.territory_id === body.territory_id)`. If found, compute `removed = existing.rights.filter(r => !body.rights.includes(r))`. If `removed.length > 0`, return:
```json
{ "error": "CONFLICT", "message": "Cannot remove previously confirmed rights", "removed": ["char-def-456"] }
```

### Regent identity check

The requesting user's character is identified via `req.user.character_ids` (the user's character list). For `is_regent` to be true, one of their characters must match the territory's `regent_id`. If the user is an ST, skip the Regent identity check — STs can confirm on behalf of any territory (useful for testing and edge-case recovery).

### Save vs Confirm — two separate actions

| Action | Button label | Writes to | Effect |
|---|---|---|---|
| Save | "Save Feeding Rights" | `territories` collection | Updates live rights (used by City panel, DT Processing, DT Story) |
| Confirm | "Confirm Feeding Rights" | `downtime_cycles[active]` | Records per-cycle snapshot; unlocks player form once all done |

These are independent. A Regent should Save first (to set up the rights), then Confirm for the cycle. They may Save again later (adjusting live rights for future cycles) without that affecting the current cycle's confirmation.

### Player form — pending territories display

To show which territories are still pending, the player form needs the territories list (already fetched) and the cycle's `regent_confirmations`. Filter territories for those with `regent_id !== null` and no matching entry in `regent_confirmations`. Render territory names as a comma-separated list in the locked banner.

### No regents edge case

If `territories.filter(t => t.regent_id)` is empty, treat the gate as satisfied — set `feeding_rights_confirmed = true` immediately when the cycle is created or transitions to `active`.

### Key files to change

- `server/schemas/downtime_submission.schema.js` — `downtimeCycleSchema` additions
- `server/routes/downtime.js` — `POST /api/downtime_cycles/:id/confirm-feeding`
- `server/tests/api-downtime-regent-gate.test.js` — new test file
- `public/js/player/downtime-form.js` — feeding/territory section gate check
- `public/js/player/regency-tab.js` — Confirm button, locked slots, call-to-action banner
- `public/js/admin/city-views.js` — per-territory confirmation chip
