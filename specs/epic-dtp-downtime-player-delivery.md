# Epic DTP: Downtime Player Delivery

## Goal

Deliver processed downtime results to players when a new cycle starts. The player report has six sections: Story Moment, Home Report, Feeding, Project Resolutions, Allies & Asset Summary, Rumours. See `specs/epic-dt-story.md` Story 1.14 for the full six-section spec.

## Context

The ST team processes and narrates downtimes in the admin app. When the Push Cycle wizard fires, the player Story tab renders the full six-section report. The Feeding tab presents the ST-validated pool for a one-shot locked feeding roll.

**Report structure (v2 — 2026-04-20):**
1. Story Moment (vignette or letter based on NPC type)
2. Home Report (ambient paragraph from `home_territory`)
3. Feeding (narrative + roll result)
4. Project Resolutions (up to 4 narrative cards)
5. Allies & Asset Summary (one-line merit outcome ledger)
6. Rumours (universal + Cacophony Savvy)

## Stories

| ID    | Title                                   | Status        |
|-------|-----------------------------------------|---------------|
| DTP-1 | Privacy scrub — projects_resolved       | ready-for-dev |
| DTP-2 | Per-action project result cards         | ready-for-dev |
| DTP-3 | Feeding tab — validated delivery        | ready-for-dev |
| DTP-4 | Merit summary delivery                  | ready-for-dev |

## DTP-4: Merit Summary Delivery

Deliver the Allies & Asset Summary section (section 5) to the player. This is a read-only ledger of one-line outcome summaries for all merit actions, grouped by category.

Key tasks:
- Read `merit_actions_resolved[i].outcome_summary` strings from the submission (set during DT Processing compact panel)
- Group by merit category: Allies → Status → Contacts → Retainers
- Render as a list in player Story tab: merit name/qualifier, action type label, outcome summary
- Suppress entire section if no outcome_summary strings are present
- Privacy scrub: `outcome_summary` is player-facing; no ST notes, no internal flags

## Dependency Order

DTP-1 must ship before DTP-2 (privacy fix gates the feature).
DTP-3 is independent.
DTP-4 depends on DT Processing compact panel having `outcome_summary` field wired (DTX-2).

## Files in Scope

- `server/helpers/strip-st-review.js`
- `server/schemas/downtime_submission.schema.js`
- `public/js/player/story-tab.js`
- `public/js/player/feeding-tab.js`
- `public/css/player-layout.css`
