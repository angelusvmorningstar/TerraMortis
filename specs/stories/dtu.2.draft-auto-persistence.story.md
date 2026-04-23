---
id: dtu.2
epic: dt-ux
status: ready-for-dev
priority: high
depends_on: []
---

# Story DTU-2: Auto-Persist DT Draft (Tab-Switch Resilience)

As a player,
I want my in-progress downtime draft to survive an accidental tab switch or browser refresh,
So that I never lose 30 minutes of writing to a stray click.

---

## Context

DT form currently only persists when the player hits Save Draft or Submit. Any tab close, accidental refresh, or browser crash between those events wipes in-progress edits. 30-player LARP + long-form narrative prompts = real risk of lost work. Add debounced auto-persistence to localStorage keyed by character and cycle.

---

## Acceptance Criteria

**Given** a player is editing the DT form
**When** they type in any input/textarea
**Then** 1 second after the last keystroke, the full form state is serialised to `localStorage` under key `tm-dt-draft-<character_id>-<cycle_id>`

**Given** a player reloads the page (same character, same cycle)
**When** the DT form mounts
**Then** if a local draft exists AND is newer than the server copy's `updated_at`, the form loads from localStorage
**And** a subtle banner appears: "Restored from local draft · [Saved to server]" (button clears local cache and reloads from server)

**Given** a player successfully submits the DT
**When** the submission returns 200
**Then** the local draft for that character/cycle is cleared from localStorage

**Given** a server draft is newer than the local copy
**When** the form mounts
**Then** the server copy wins and local is discarded (no prompt)

**Given** the player is over 5MB of localStorage usage
**When** saving fails with QuotaExceeded
**Then** a non-blocking toast warns the player that local autosave is unavailable and they should Save Draft manually

---

## Implementation Notes

- New helper: `public/js/tabs/draft-persist.js` with `saveDraft(charId, cycleId, formState)`, `loadDraft(charId, cycleId)`, `clearDraft(charId, cycleId)`, `compareTimestamps(local, server)`.
- Wire into `public/js/tabs/downtime-form.js`:
  - On input event (debounced 1000ms) → `saveDraft`
  - On form mount → `loadDraft`, compare to server copy, decide which to render
  - On submit success → `clearDraft`
- Key format: `tm-dt-draft-<character_id>-<cycle_id>`. Value: JSON `{ responses: {...}, updated_at: ISOString }`.
- No server changes required.
- Banner UI: small strip above the form header. "Restored from local draft · [Saved to server]" link/button.
- Reconciliation rule (silent): local wins if `local.updated_at > server.updated_at`. Otherwise server wins. No prompt on auto-restore; just the banner so player knows.

---

## Files Expected to Change

- `public/js/tabs/draft-persist.js` (new)
- `public/js/tabs/downtime-form.js`
- `public/css/components.css` (banner styling)
- `tests/dt-draft-persistence.spec.js` (new — Playwright test for reload/restore flow)
