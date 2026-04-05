# Known Issues

Tracked issues to address in future work. Not blocking current operation.

## Resolved

- ~~**Pronouns edit option**~~ — Added to identity editor and sheet edit mode
- ~~**Attributes overflow**~~ — Fixed in admin desktop layout
- ~~**Priority dropdowns**~~ — Fixed to enforce mutual exclusivity
- ~~**Attendance and XP Tracker**~~ — Implemented as Attendance & Finance tab with game_sessions collection
- ~~**Player Access Layer**~~ — Complete (Epic 5)

## Admin Character Sheet

1. **Merit prerequisite validation** — Merits with prerequisites (e.g., Closed Book requires Resolve 3) are not validated against the character's actual stats. Characters may have merits they don't qualify for. Needs both batch audit and editor enforcement.

2. **Blood Stats pool breakdown** — Currently shows `Pool: 8` (numeric only). Desired: show attribute + skill + discipline names with calculated total, e.g. `Presence + Intimidation + Nightmare (8)`.

## Data Issues

3. **Unaccounted SP sources** — ~10 domain merits (shared Safe Place/Haven for Carver/Hazel/Magda, Charlie/Ivana/Keeper groups) have standing points but no recorded source. Need master sheet to resolve.

4. **MCI cult names blank** — Livia, Mammon, Ludica Lachramore, Charles Mercer-Willows have Mystery Cult Initiation without cult names.

5. **Merit point audit** — `merit_creation` positional data may be misaligned after domain/standing merit additions. Static `xp_log.spent` values used as fallback. Full CP/Free/XP reconciliation deferred until master sheet is fully audited.

6. **Game 2 XP** — Attendance data partially entered. Need full Game 2 attendance to complete.

## Future Features

7. **Finance Tracker** — Monthly income tracking by payment method. Per-month revenue, expenses by category, running totals. Linked to attendance tracker payment status. Needs its own collection or extension of game_sessions.

8. **Google Calendar integration** — Auto-populate game session dates from `terramortislarp@gmail.com` calendar. Replace manual date entry in Attendance tab.

9. **CI test suite** — GitHub Actions runs Vitest integration tests against tm_suite_test DB on push to dev/main. MongoDB Atlas must allow connections from GitHub Actions runner IPs (add `0.0.0.0/0` in Atlas Network Access, or add the runner IP range). Currently failing due to Atlas IP allowlist blocking CI runners.
