# Story DTX.4: Copy Context Polish + Territory Reports for All

Status: complete

## Story

As an ST writing downtime narrative,
I want richer, more accurate copy context prompts and territory reports shown for every player,
so that I have the right information in front of me without manual cross-referencing.

## Acceptance Criteria

1. All six copy context prompt builders include a "no sentence fragments" style rule.
2. Letter from Home context includes the previous cycle's written letter when one exists (fetched async by game_number − 1).
3. Touchstone prompt uses updated style rules matching the canonical ST template.
4. DT Story shows the ST's action type override (projects_resolved[idx].action_type_override) rather than the player's original action type.
5. A dedicated Patrol/Scout context builder provides feeder list by territory, discipline profile, other actions categorised by phase, patrol calibration block, and observation rules block.
6. Project context prompt overhaul: character depth block, territory block with ambience, poacher list, prior actions.
7. Feeding action detail shows a read-only "Territories: X, Y" line drawn from the player's submitted feeding_territories JSON (before the ST pill-override row).
8. Rote Feed project detail shows the same "Territories: X, Y" line.
9. Territory context prompt: Ambience shows net change (+N/−N), Poachers always shown, Discipline activity always shown, new "Territory reports should address" block, new "Discipline impact thresholds" block, revised style rules.
10. All players receive a Territory Report section regardless of resident territory status. Characters with no declared territory default to a Barrens report.

## Tasks / Subtasks

- [x] Task 1: No-sentence-fragments rule on all prompts (downtime-story.js — all 6 style-rules blocks)
- [x] Task 2: Letter from Home — previous cycle correspondence (handleCopyLetterContext async; fetches all cycles, finds game_number − 1, extracts st_narrative.letter_from_home.response)
- [x] Task 3: Touchstone style rules — updated order and wording to match ST template
- [x] Task 4: DT Story action type: read projects_resolved[idx].action_type_override || action_type (lines 427 and 864 in downtime-story.js)
- [x] Task 5: Patrol/Scout context builder — buildPatrolContext(), local _PATROL_DISCS array, handleCopyProjectContext routes to it when actionType === 'patrol_scout'
- [x] Task 6: Project context prompt overhaul — handleCopyProjectContext made async, fetches cycle + territory data in parallel
- [x] Task 7: Feeding territory display — _playerFeedTerrsText(sub) helper in downtime-views.js; injected into feeding action detail (before pills row) and rote feed project detail
- [x] Task 8: Territory context prompt overhaul — net ambience change, always-present Poachers/Discipline sections, purpose + discipline threshold blocks, revised style rules
- [x] Task 9: All-player territory reports — _feedTerrEntries(sub) helper; Barrens fallback when no territories declared; territoryReportsComplete updated; renderTerritoryReports early exit removed

## Dev Notes

### Key files changed
- `public/js/admin/downtime-story.js` — all prompt builders, Patrol context, territory reports
- `public/js/admin/downtime-views.js` — _playerFeedTerrsText, feeding territory display
- `public/js/editor/merits.js` — INFLUENCE_MERIT_TYPES guard in buildMeritOptions
- `server/schemas/character.schema.js` — humanity_lost + humanity_xp added

### Patrol context (NFR-DS-01 compliant)
- Cannot import KNOWN_DISCIPLINES from downtime-views.js — local _PATROL_DISCS array defined in downtime-story.js
- Feeder list built by parsing _allSubmissions.responses.feeding_territories JSON
- Discipline profile from cycleData.discipline_profile[terrId]

### Feeding territory sentinel
- TERRITORY_SLUG_MAP['the_barrens'] = null — Barrens ID sentinel is the string 'barrens'
- buildTerritoryContext handles 'barrens': terrName = 'The Barrens'
- handleCopyTerritoryContext: !terrId guard passes for 'barrens' (truthy string)

### Ambience net change
- AMBIENCE_STEPS array used to compute confirmedIdx − currentIdx
- Formatted as +N or −N

### Territory report completion
- _feedTerrEntries(sub): parses all non-'none'/'Not feeding here' entries, dedupes by ID, falls back to Barrens
- territoryReportsComplete: requires reports.length >= feedTerrs.length

## Dev Agent Record

### Completion Notes List

- Commits: 91bd8dc, 5151b90, 613b5c8, 862b4d1, 1b5b628, 9daf337, fb33ed2, 8ea33f9, 245be7e, 8bef98a
- Merged to main 2026-04-16

### File List

- `public/js/admin/downtime-story.js`
- `public/js/admin/downtime-views.js`
- `public/js/editor/merits.js`
- `server/schemas/character.schema.js`
- `specs/stories/dtx.4.copy-context-and-territory-polish.story.md`
