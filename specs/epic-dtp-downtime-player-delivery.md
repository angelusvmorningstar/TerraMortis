# Epic DTP: Downtime Player Delivery

## Goal

Deliver processed downtime results to players when a new cycle starts — per-action project cards in the Story tab, and the pre-game feeding roll with ST-validated parameters.

## Context

The ST team processes and narrates downtimes in the admin app. When the Push Cycle wizard fires, the Story tab should show each player their project results (name, objective, ST narrative, dice pool, roll, feedback) and the Feeding tab should present the ST-validated pool for a one-shot locked feeding roll. These are the two delivery channels that close the loop between ST processing and player visibility.

## Stories

| ID    | Title                                   | Status        |
|-------|-----------------------------------------|---------------|
| DTP-1 | Privacy scrub — projects_resolved       | ready-for-dev |
| DTP-2 | Per-action project result cards         | ready-for-dev |
| DTP-3 | Feeding tab — validated delivery        | ready-for-dev |

## Dependency Order

DTP-1 must ship before DTP-2 (privacy fix gates the feature).
DTP-3 is independent.

## Files in Scope

- `server/helpers/strip-st-review.js`
- `server/schemas/downtime_submission.schema.js`
- `public/js/player/story-tab.js`
- `public/js/player/feeding-tab.js`
- `public/css/player-layout.css`
