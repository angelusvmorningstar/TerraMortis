# Story fix.41: Player Profile — Contact & Emergency Fields

## Status: done

## Story

**As an** ST and player,
**I want** optional player contact fields (email, mobile, medical info, emergency contact) stored on the player record and editable by the player themselves,
**so that** STs have access to safety-critical information during live games and players control their own data.

## Background

Player records currently store only Discord identity and role. STs have requested additional optional fields for live game safety: email, mobile, medical information, and emergency contact details. These fields must be:
- Editable by the player themselves (not just STs)
- Visible to STs in the admin Player tab
- Accessible via the player portal (clicking their Discord avatar)

The admin Player tab also needs a UX refresh: expandable cards with inline edit, icon buttons instead of text labels.

## Dependencies

None.

## Acceptance Criteria

### Schema & API
1. Player schema gains 5 new optional fields: `email`, `mobile`, `medical_info`, `emergency_contact_name`, `emergency_contact_mobile` (all `string|null`)
2. New API endpoint `PUT /api/players/me` — allows any authenticated player to update their own contact fields (allowlisted to the 5 new fields only — cannot change role, character_ids, discord_id, etc.)
3. Existing `PUT /api/players/:id` (ST only) can also write the new fields
4. `GET /api/players/me` returns the full player doc including new fields

### Player portal — self-edit modal
5. Clicking the Discord avatar in the sidebar (`#sidebar-user`) opens a modal dialog
6. Modal displays: player display name (read-only), Discord username (read-only), and editable inputs for email, mobile, medical info, emergency contact name, emergency contact mobile
7. Medical info uses a `<textarea>` (multi-line), other fields use `<input type="text">` (mobile fields use `type="tel"`)
8. Save button calls `PUT /api/players/me`, shows success/error feedback, closes on success
9. Cancel button closes the modal without saving
10. A privacy note is visible: "This information is only visible to Storytellers and is used for live game safety."

### Admin Player tab — card expansion & edit
11. "Edit" text button replaced with a pencil icon button
12. "Remove" text button replaced with a bin/trash icon button
13. Clicking a player card row expands it to show a detail panel with: email, mobile, medical info, emergency contact name, emergency contact mobile (read-only display, dimmed placeholders for empty fields)
14. Clicking a second time collapses the expanded card
15. The edit (pencil) button moves from the row into the expanded detail panel
16. Clicking edit in the expanded panel turns all fields (including the 5 new fields) into editable inputs (inline edit mode — same card, not a separate form)
17. Save/Cancel buttons appear in edit mode; saving calls `PUT /api/players/:id`, cancelling reverts to read-only display
18. The existing full edit form (with character linking, role selection) is preserved — the pencil button triggers it from within the expanded card

## Tasks / Subtasks

- [ ] Task 1: Schema update (AC: 1)
  - [ ] Add to `server/schemas/player.schema.js` properties:
    ```
    email:                    { type: ['string', 'null'] },
    mobile:                   { type: ['string', 'null'] },
    medical_info:             { type: ['string', 'null'] },
    emergency_contact_name:   { type: ['string', 'null'] },
    emergency_contact_mobile: { type: ['string', 'null'] },
    ```

- [ ] Task 2: API — player self-update route (AC: 2, 3, 4)
  - [ ] Add `PUT /api/players/me` in `server/routes/players.js`:
    - Any authenticated user (no `requireRole`)
    - Allowlist: only `email`, `mobile`, `medical_info`, `emergency_contact_name`, `emergency_contact_mobile` accepted from body
    - Reject any other fields silently (strip them)
    - Update via `findOneAndUpdate({ _id: req.user.player_id }, { $set: filtered }, { returnDocument: 'after' })`
    - Return updated player doc
  - [ ] Place route BEFORE `/:id` to avoid Express param capture conflict
  - [ ] Existing `PUT /api/players/:id` (ST only): add the 5 new fields to its allowlist (or verify it already passes through due to spread)

- [ ] Task 3: Player portal — self-edit modal (AC: 5, 6, 7, 8, 9, 10)
  - [ ] In `public/js/player.js`, add click handler on `#sidebar-user` (or the avatar img within it)
  - [ ] Fetch current player data via `GET /api/players/me`
  - [ ] Render a modal overlay (follow existing modal patterns — `.plm-overlay`/`.plm-dialog` in `admin-layout.css`, or create a minimal `player-profile-modal` in player CSS):
    - Header: "Your Profile"
    - Read-only: display name, Discord username
    - Editable: email (`<input type="email">`), mobile (`<input type="tel">`), medical info (`<textarea rows="3">`), emergency contact name (`<input type="text">`), emergency contact mobile (`<input type="tel">`)
    - Privacy note: italicised text below the form
    - Footer: Save button, Cancel button, status message area
  - [ ] Save: collect field values, `PUT /api/players/me`, show success toast or inline status, close modal
  - [ ] Cancel: close modal, no save
  - [ ] Add modal CSS to `public/css/player.css` (or the appropriate player stylesheet)

- [ ] Task 4: Admin Player tab — expandable cards (AC: 11, 12, 13, 14, 15, 16, 17, 18)
  - [ ] In `public/js/admin/players-view.js`:
    - Add `expandedId` state variable (tracks which card is expanded, `null` if none)
    - Update `playerCard(p)`: replace "Edit" text with pencil icon (`<button class="pv-icon-btn" title="Edit">&#9998;</button>` or SVG), replace "Remove" text with bin icon (`<button class="pv-icon-btn pv-remove-btn" title="Remove">&#128465;</button>` or `&times;` or SVG)
    - Move edit and remove buttons: edit goes inside the expanded panel, remove stays on the row (or both in expanded panel — follow the request: edit moves to expanded, remove stays as icon on row)
    - Add click handler on the card row itself (`.pv-card`): toggles `expandedId`
    - When expanded, render a detail panel below the card header showing:
      - Email (or "Not provided" dimmed)
      - Mobile (or "Not provided" dimmed)
      - Medical info (or "Not provided" dimmed)
      - Emergency contact name (or "Not provided" dimmed)
      - Emergency contact mobile (or "Not provided" dimmed)
      - Last login date
      - Linked characters
      - Edit button (pencil icon) — clicking triggers `editingId = p._id` and re-renders with inline inputs
    - When in edit mode within the expanded card: all fields become inputs (existing form fields + new contact fields), with Save/Cancel buttons
  - [ ] Ensure clicking the card row doesn't trigger expand when clicking a button (use `e.target.closest('button')` guard)

- [ ] Task 5: CSS updates (AC: 11, 12, 13)
  - [ ] Icon buttons: `.pv-icon-btn` — subtle, no background, gold on hover, appropriate size
  - [ ] Expanded card: `.pv-card-expanded` — additional padding, detail grid below the header row
  - [ ] Detail fields: 2-column grid for short fields, full-width for medical info textarea
  - [ ] Privacy note: italic, muted colour
  - [ ] Transition: smooth expand/collapse (optional, CSS `max-height` transition)

## Dev Notes

### Route ordering in Express

`PUT /api/players/me` must be defined BEFORE `PUT /api/players/:id` in the router. Otherwise Express treats "me" as an `:id` parameter and the ST-only middleware blocks player self-updates.

### Allowlist for self-update

The `/me` PUT endpoint MUST only accept the 5 contact fields. A player must not be able to escalate their role, change their discord_id, or modify character_ids via this endpoint. Use a strict allowlist:

```js
const SELF_EDITABLE = new Set(['email', 'mobile', 'medical_info', 'emergency_contact_name', 'emergency_contact_mobile']);
const filtered = {};
for (const [k, v] of Object.entries(req.body)) {
  if (SELF_EDITABLE.has(k)) filtered[k] = v;
}
```

### Data sensitivity

Medical info and emergency contacts are sensitive personal data. The fields are stored in MongoDB alongside existing player data. No additional encryption is applied (consistent with the project's current approach to Discord tokens). The privacy note in the modal sets player expectations.

### Admin Player tab — existing edit form

The current edit form (`playerForm()`) handles display name, Discord username, Discord ID, role, and character linking. The new expandable card edit mode should present the 5 new contact fields PLUS the existing fields. Reuse the existing `playerForm()` structure but render it inline within the expanded card instead of replacing the whole card.

### Icon options

Use HTML entities or simple SVG for icons (no icon library dependency):
- Pencil: `&#9998;` (✎) or `&#x270F;` (✏)
- Bin: `&#128465;` (🗑) or `&#x2715;` (✕) with title="Remove"
- Alternatively, use the project's existing SVG icon pattern if one exists (check `data/icons.js`)

### Testing

- Player logs in → clicks avatar → modal opens with empty fields → fills in email + mobile → saves → verify data persists on reload
- Player tries to set role via PUT /me → verify field is stripped (not updated)
- ST opens Player tab → clicks a player card → card expands showing contact fields
- ST clicks edit in expanded card → fields become editable → saves → verify update
- ST clicks remove (bin icon) on row → confirmation dialog → player deleted
- Verify a player with no contact fields shows "Not provided" placeholders
- Verify medical info textarea handles multi-line text

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
