# Known Issues

Tracked issues to address in future stories. Not blocking current work.

## Resolved

- ~~**Pronouns edit option**~~ — Added to identity editor and sheet edit mode
- ~~**Attributes overflow**~~ — Fixed in admin desktop layout
- ~~**Priority dropdowns**~~ — Fixed to enforce mutual exclusivity
- ~~**Attendance and XP Tracker**~~ — Implemented as Attendance & Finance tab with game_sessions collection

## Admin Character Sheet — Edit View

1. **Merit prerequisite validation** — Merits with prerequisites (e.g., Closed Book requires Resolve 3) are not validated against the character's actual stats. Characters may have merits they don't qualify for. Needs both batch audit and editor enforcement.

2. **Blood Stats pool breakdown** — Currently shows `Pool: 8` (numeric only). Desired: show attribute + skill + discipline names with calculated total, e.g. `Presence + Intimidation + Nightmare (8)`.

## Data Issues

3. **Unaccounted SP sources** — ~10 domain merits (shared Safe Place/Haven for Carver/Hazel/Magda, Charlie/Ivana/Keeper groups) have standing points but no recorded source. Need master sheet to resolve.

4. **MCI cult names blank** — Livia, Mammon, Ludica Lachramore, Charles Mercer-Willows have Mystery Cult Initiation without cult names.

5. **Merit point audit** — `merit_creation` positional data may be misaligned after domain/standing merit additions. Static `xp_log.spent` values used as fallback. Full CP/Free/XP reconciliation deferred.

6. **Game 2 XP** — Attendance data partially entered. Need full Game 2 attendance to complete.

## Future Features

7. **Finance Tracker** — Monthly income tracking by payment method. Per-month revenue, expenses by category, running totals. Linked to attendance tracker payment status. Needs its own collection or extension of game_sessions.

8. **Google Calendar integration** — Auto-populate game session dates from `terramortislarp@gmail.com` calendar. Replace manual date entry in Attendance tab.

9. **Player Access Layer** (Epic 5) — Players log in via Discord, see only their characters. Requires players collection, character-to-player mapping, role-based auth.
