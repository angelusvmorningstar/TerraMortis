# Story EPB.7: Emergency Contact Access from Any ST Character View

Status: done

## Story

**As an** ST viewing a character in the game app or admin,
**I want** to access that character's player emergency contact in one tap,
**so that** I can respond quickly in a safety situation without navigating away.

## Background

During the first live game, an ST needed emergency contact info for a player. They were viewing that player's character in the game app, tapped "Emergency Contact", and got their OWN contact info instead. They had to navigate to the admin Player tab and scroll to find the correct record.

Emergency contact is stored in the `players` collection, linked to characters via `character.player` (player name string) → `player.name`.

## Acceptance Criteria

1. In the ST game app character view, a clearly labelled "Emergency Contact" button is visible when viewing any character.
2. Tapping it fetches and displays the emergency contact details for that character's linked player — name, phone, and any notes.
3. If no emergency contact is on file, shows "No emergency contact recorded."
4. The display is a simple modal or inline panel — not a navigation away from the character.
5. The button is visible to ST role only.
6. Works from the admin character sheet editor view as well.

## Tasks / Subtasks

- [ ] Read `public/js/admin/players-view.js` to find the emergency contact field structure in player records
- [ ] Add a `getEmergencyContact(char)` helper: calls `GET /api/players`, finds the player matching `char.player`, returns emergency contact fields
- [ ] Add "Emergency Contact" button to the game app character view (ST only) — near the character header
- [ ] Add the same button to the admin sheet editor character header
- [ ] On click: fetch contact, show in a simple modal (`<dialog>` or overlay div) with name, phone, notes
- [ ] Add modal HTML and minimal CSS using design system tokens (`.panel`, `--surf2`, `--txt`, `--bdr`)
- [ ] Close button on modal — keyboard Escape also closes

## Dev Notes

- `public/js/admin/players-view.js` — find the emergency contact field name (likely `emergency_contact`, `emergency_phone`, or similar)
- `public/js/data/api.js` — `apiGet('/api/players')` returns all player records (ST-auth required)
- ST role check: `import { isSTRole } from '../auth/discord.js'` — only show button when `isSTRole()` is true
- Modal pattern: use `<dialog>` element if available, or a simple absolutely-positioned div with `--surf` background, `--bdr` border, `z-index: 1000`
- Do not navigate away — the whole point is zero-navigation access
- `public/js/admin.js` — character view in game app context; look for where the character header/panel is rendered

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
