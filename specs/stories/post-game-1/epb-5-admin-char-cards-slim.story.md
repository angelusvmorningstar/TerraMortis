# Story EPB.5: Slim Down Admin Character Cards

Status: ready-for-dev

## Story

**As an** ST using the admin character grid,
**I want** character cards to show only name, warnings, and ordeal chip,
**so that** I can scan the roster quickly without information overload.

## Background

The current `.char-card` in `admin.js` shows name, player name, covenant/clan/bloodline tags, BP, humanity, XP, and icons. This is too dense for quick navigation. The full detail is available in the sheet editor — cards just need to get you there.

## Acceptance Criteria

1. Each character card shows: display name, ordeal chip (if applicable), and warning badges only.
2. Player name, clan/covenant tags, BP/humanity/XP stats are removed from the card.
3. Clan and covenant icons are removed from the card.
4. Warning indicators (audit badges, XP overspend, etc.) remain — they are the reason to click in.
5. Cards remain clickable and open the sheet editor as before.
6. Retired characters section is unchanged.
7. Cards use existing `.char-card`, `.cc-name` classes — no new CSS needed.

## Tasks / Subtasks

- [ ] Read the `renderCharGrid()` function in `public/js/admin.js` to understand current card HTML
- [ ] Strip from each active card: player name, clan/cov icons, `.cc-tag` chips, `.cc-bot` stats row
- [ ] Keep: `.cc-name` (display name), audit/warning badges, ordeal chip
- [ ] Verify cards still open the sheet editor on click
- [ ] Verify retired section unchanged

## Dev Notes

- `public/js/admin.js` — `renderCharGrid()` function, look for `.char-card` HTML generation
- `.char-card` base styles stay in `components.css` — do not modify CSS, only change the JS-generated HTML
- Ordeal chip: check what class/flag drives it in the current card render — keep it
- Warning badges: the `_auditBadge` / audit warning logic — keep it
- This is a JS-only change in `admin.js`

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
