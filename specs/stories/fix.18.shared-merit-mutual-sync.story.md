# Story Fix.18: Shared Merits — Mutual Sync on Save

## Status: ready-for-dev

## Story

**As an** ST linking two characters via a shared merit,
**I want** the sharing relationship to be automatically reflected on both characters in the database,
**so that** I don't have to open and save each partner separately to make the link persist.

## Background

The sharing system correctly updates all group members **in memory** when a partner is added or removed. The `shAddDomainPartner` and `shRemoveDomainPartner` functions in `edit-domain.js` walk the full group (`fullGroup = [this char, ...existing partners, new partner]`) and update every member's `shared_with` array in `state.chars`. This is correct.

**The problem is persistence.** When the ST saves Character A, the API call (`PUT /api/characters/:id`) only writes Character A. Character B and C's in-memory updates are lost the next time the page is loaded or any character's data is refreshed from the API.

### Current save path

`saveCharToApi()` in `admin.js` (lines 484–510):
1. Builds the body from `state.editChar`
2. `apiPut('/api/characters/' + _id, body)` — saves only the active character
3. Updates the in-memory entry: `Object.assign(chars[idx], updated)`
4. Clears the dirty flag

Character B's in-memory changes (updated `shared_with` array, possibly a new merit entry) never reach the database.

### Solution approach

When saving Character A, collect any partner characters whose data was changed in memory (specifically: any character in `state.chars` where the save of Character A caused a change to their merits or `shared_with` fields), and save those to the API as well.

The cleanest client-side approach: after saving the primary character, identify all characters who share a domain merit with the just-saved character, compare their current in-memory state against what was last fetched from the API, and fire additional save calls for any that differ.

However, `saveCharToApi` only tracks dirty state for the **active** character. A simpler and more robust approach is:

**On save, cascade-save all dirty partner characters.** The `shAddDomainPartner` and `shRemoveDomainPartner` functions already know which characters they modified (they loop `fullGroup`). They should call `_markPartnerDirty(partnerId)` alongside the existing `_markDirty()`. Then `saveCharToApi` checks for dirty partners and fires their saves after the primary save completes.

### Alternative: server-side cascade

The server route `PUT /api/characters/:id` could accept an optional `cascade_partners` body field — an array of `{ _id, updates }` objects for partner characters — and apply them in the same request. This keeps the client simple but increases server complexity.

**Recommended approach: client-side cascade save** (simpler, no server changes needed).

## Acceptance Criteria

1. When ST adds Safe Place as shared between Carver and Magda on Carver's sheet, then saves Carver — Magda's DB record is automatically updated to include Safe Place in her `shared_with` list
2. When ST removes a partner from a shared merit and saves — the removed partner's DB record is updated to remove the `shared_with` relationship (and the merit if their contribution is 0)
3. The primary character save completes first; partner saves are non-blocking (fire in parallel after)
4. If a partner save fails, the ST sees a non-modal warning (console + a brief status message) — the primary save is not rolled back
5. No change to the server API is required

## Tasks / Subtasks

### Task 1: Track which partner characters are dirtied by domain edits (`edit-domain.js`)

- [ ] Add a `_dirtyPartners` Set at module scope (or alongside `_dirty` in admin.js state):
  ```js
  const _dirtyPartners = new Set(); // character _id strings
  ```
- [ ] In `shAddDomainPartner`, after modifying each partner's data in `state.chars`, add their `_id` to `_dirtyPartners`
- [ ] In `shRemoveDomainPartner`, do the same for any modified partner
- [ ] Export or expose `_dirtyPartners` and a `clearDirtyPartners()` function so `admin.js` can consume it

### Task 2: Cascade-save dirty partners after primary save (`admin.js`)

- [ ] In `saveCharToApi()`, after the primary `apiPut` resolves successfully:
  ```js
  // Cascade-save any partner characters dirtied by domain sharing edits
  const partnerIds = [..._dirtyPartners].filter(id => id !== _id);
  clearDirtyPartners();
  if (partnerIds.length) {
    const savePromises = partnerIds.map(pid => {
      const pc = chars.find(c => c._id === pid);
      if (!pc) return Promise.resolve();
      return apiPut('/api/characters/' + pid, buildSaveBody(pc))
        .then(updated => { Object.assign(pc, updated); })
        .catch(err => console.warn('Partner save failed for', pid, err));
    });
    await Promise.all(savePromises);
  }
  ```
- [ ] Extract the body-building logic from `saveCharToApi` into a `buildSaveBody(c)` helper (or call the existing logic inline if it's simple enough to reuse)
- [ ] `buildSaveBody(c)` MUST strip all ephemeral fields (those prefixed with `_`, e.g. `_grant_pools`, `_pt_nine_again_skills`, `_mci_free_specs`, `_bloodline_free_specs`, `_ots_free_dots`) — the same fields that the primary save already strips. Failing to do this will write ephemeral runtime data to the DB for partner characters. Examine the existing `saveCharToApi` body-building logic to confirm the exact strip list before implementing.

### Task 3: Verify round-trip

- [ ] Manual test: add Safe Place shared between Carver and Magda on Carver's sheet → save Carver → reload the page → open Magda's sheet → confirm Safe Place appears with Carver in `shared_with`
- [ ] Manual test: remove the sharing on Carver's sheet → save Carver → reload → confirm Magda's Safe Place is also updated

## Dev Notes

- `shAddDomainPartner` and `shRemoveDomainPartner` are in `public/js/editor/edit-domain.js` lines 308–380
- `saveCharToApi` is in `public/js/admin.js` lines 484–510
- `_dirty` is already tracked per-character in admin.js — `_dirtyPartners` follows the same pattern but holds partner IDs rather than a boolean
- The `buildSaveBody` extraction will involve the same stripping logic as the existing save (removing ephemeral fields). If refactoring is complex, it is acceptable to duplicate the call inline for partner saves.
- Partner saves are fire-and-update: they update the partner's in-memory entry from the API response, keeping `state.chars` in sync with the DB.

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
