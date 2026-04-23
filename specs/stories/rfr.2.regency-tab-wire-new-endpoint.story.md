---
id: rfr.2
epic: regent-feeding-rights
status: ready-for-dev
priority: critical
depends_on: [rfr.1]
---

# Story RFR-2: Regency Tab — Wire New Endpoint + Surface Locked Entries

As the Regent's player,
I want my Regency tab to save successfully and to show me clearly which rights I can't remove this cycle,
So that I can govern my territory without tripping over silent errors.

---

## Context

With RFR-1 providing a regent-writable endpoint, the Regency tab needs to:
1. Call the new PATCH endpoint instead of `POST /api/territories` (which stays ST-only).
2. Load the active cycle's submissions to compute which characters are "locked" (already fed this cycle with permission).
3. Render locked rows disabled with a clear chip and explanatory text.
4. Rewrite the existing "Save failed: Insufficient role" error copy since it should no longer fire under normal use.

---

## Acceptance Criteria

**Given** the player loads the Regency tab
**When** the tab renders
**Then** a list of additional feeding rights slots is shown (existing behaviour)
**And** for each saved character who has a submitted DT this cycle marked as 'resident' on this territory, the row is disabled
**And** a chip appears next to that row reading "Fed this cycle — cannot remove"

**Given** the player edits rights and hits "Save Feeding Rights"
**When** the save succeeds
**Then** status shows "Saved" briefly (existing behaviour)
**And** no "Insufficient role" error occurs

**Given** the player tries to remove a locked character and saves
**When** the backend returns 409 with `{ locked: [id] }`
**Then** the UI shows "Cannot remove: [character name] has fed here this cycle"
**And** the offending slot is visually highlighted

**Given** the player is not the Regent of this territory (e.g., character change)
**When** the Regency tab tries to render
**Then** the tab gracefully shows "No active regency" (existing guard — confirm still works)

**Given** an ST opens the Regency tab via admin
**When** they save
**Then** saves succeed without lock enforcement (ST override — handled server-side)

---

## Implementation Notes

- `public/js/tabs/regency-tab.js`:
  - Replace `apiPost('/api/territories', { id, feeding_rights })` on line 210 with `apiPatch('/api/territories/' + ri.territoryId + '/feeding-rights', { feeding_rights })`.
  - Add `apiPatch` helper to `public/js/data/api.js` if not present.
  - On mount, load active cycle + its submitted submissions: `GET /api/downtime_cycles` + `GET /api/downtime_submissions?cycle_id=<id>&status=submitted`.
  - Compute locked set client-side (so UI disables rows immediately). Parse each submission's `responses.feeding_territories` JSON; if it has `<this-territory-slug>: 'resident'` AND `character_id` is in current `feeding_rights`, mark locked.
  - Render locked slot as `<select disabled>` with the locked character pre-selected. Add chip `<span class="reg-locked-chip">Fed this cycle — cannot remove</span>`.
- Handle 409 response by reading the `locked` array and cross-referencing to character names for the error message.
- The existing "Confirmed" chip pattern at `regency-tab.js:133-135` is a good visual precedent. Reuse the styling approach (new class `.reg-locked-chip`).
- **CSS**: new class `.reg-locked-chip` in `public/css/suite.css`. Use existing `--crim-a12` background + `--crim` text, or `--gold-a12` + `--gold` — pick whichever reads as "informational lock", not as an error.
- Don't regress the existing "Confirmed" chip flow (per-cycle feeding-rights confirmation).
- **Test**: Playwright spec at `tests/regency-tab-locked-rights.spec.js` covering: (a) regent save succeeds, (b) locked row disabled + chip visible, (c) 409 response shows inline error.

---

## Files Expected to Change

- `public/js/tabs/regency-tab.js`
- `public/js/data/api.js` (if `apiPatch` not already present)
- `public/css/suite.css`
- `tests/regency-tab-locked-rights.spec.js` (new)
