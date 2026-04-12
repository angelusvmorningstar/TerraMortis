# Story feature.47: Processing Mode — Ambience Dashboard

## Status: Done

## Story

**As an** ST processing a downtime cycle,
**I want** a live ambience calculation panel that updates as actions resolve,
**so that** I can see the net ambience change per territory and the discipline profile without building a manual spreadsheet.

## Background

The Downtime 2 Ambience Matrix document is a manually maintained spreadsheet showing per territory: starting ambience, entropy (−1 default), overfeeding penalty, positive/negative influence, positive/negative downtime project successes, net total, and the discipline profile (which disciplines were used in which territory for feeding and ambience actions).

This story makes that calculation live and automatic. It does not replace the manual review decisions (which actions count, which territories are affected) — those are made during features 43–46. What it does is aggregate the results of those decisions into a live dashboard.

This story depends on:
- **feature.43** — validation state on each action
- **feature.45** — feeding roll results and discipline × territory recording
- **feature.46** — project/merit roll results and ambience project successes

---

## Acceptance Criteria

1. A collapsible "Ambience Dashboard" panel appears in Processing Mode, visible at all times (not tied to a specific phase section).
2. The dashboard shows a table: one row per territory with columns: Territory | Starting | Entropy | Overfeeding | Influence | Projects | **Net Change**.
3. **Starting ambience** — the territory's current `ambience` step name (from the territories collection or `TERRITORY_DATA`).
4. **Entropy** — always −1 per territory per cycle (hardcoded default, not editable in this story).
5. **Overfeeding** — 0 if the number of characters feeding in that territory ≤ the territory's `AMBIENCE_CAP[ambience]`; otherwise −1 per character over the cap.
6. **Influence** — sum of net ambience points from resolved influence/ally actions tagged to that territory. Influence actions with type `ambience_increase` contribute +1 per resolved action (allies actions within favour rating are automatic); `ambience_decrease` contribute −1. This is a count of resolved influence actions, not success count.
7. **Projects** — sum of dice roll successes from all resolved `ambience_increase` and `ambience_decrease` project actions tagged to that territory. Ambience increase successes are positive; decrease successes are negative.
8. **Net Change** — sum of all columns. Displayed as a signed integer (e.g. +9, −2).
9. The net change is shown alongside a preview of the resulting ambience step:
   - If net > 0 and capped at +1 step improvement per month: show the projected new step in green
   - If net < 0: show degradation (no cap on degradation, up to −2 steps per month)
   - If net = 0: no change
10. The table updates live as the ST resolves actions (validates pools and records rolls) — no manual "recalculate" button required.
11. Below the ambience table: **Discipline Profile Matrix** — a table of discipline × territory showing the count of validated uses in feeding and ambience-affecting actions for the current cycle. Populated from `cycle.discipline_profile` (written by features 45 and 46).
12. The discipline profile matrix only shows disciplines and territories that have at least one recorded use (no empty rows/columns).
13. Below the discipline profile: a **Notes** section — a small free-text area for ST observations about the territory picture (e.g., "High Obfuscate in Academy again — carry this into territory report flavour"). This is purely a working note for STs, not player-facing.

---

## Ambience Step Ladder

For calculating projected new steps from net change:

```js
const AMBIENCE_STEPS = [
  'Hostile', 'Barrens', 'Neglected', 'Untended',
  'Settled', 'Tended', 'Curated', 'Verdant', 'The Rack'
];
// Index 0 = Hostile, Index 8 = The Rack
```

To move steps: `newIndex = clamp(currentIndex + stepDelta, 0, 8)`.

The net change from the table is in **points**, not steps. The conversion: **each ambience step requires a threshold of points to cross**. Since this was calculated as a running total in DT1/DT2 with no explicit threshold documented, use the following working rule established in the DT1 retrospective:

> "Project successes count directly toward the ambience tally (not halved). Maximum one step improvement per month; up to two steps degradation."

So: display the net total as informational. The ST uses it to judge step movement. The dashboard does **not** auto-apply a step change — that remains the existing `applyAmbience` button flow. The dashboard is a preview only.

---

## Tasks / Subtasks

- [x] Task 1: Ambience dashboard panel (AC: 1, 2)
  - [x] Add a collapsible "Ambience Dashboard" section to the Processing Mode view, above the phase sections (always visible)
  - [x] Render a table: Territory | Starting | Entropy | Overfeeding | Influence | Projects | Net Change | Projected Step

- [x] Task 2: Data aggregation for each column (AC: 3–9)
  - [x] **Starting**: read territory `ambience` field from DB via `ensureTerritories()`; falls back to `TERRITORY_DATA`
  - [x] **Entropy**: hardcoded −1 per territory
  - [x] **Overfeeding**: count characters with `resident` or `poach` status per territory from all `responses.feeding_territories`; penalty = max(0, feeders − cap) expressed as negative
  - [x] **Influence**: scan `merit_actions_resolved` with `ambience_increase`/`ambience_decrease` type, `validated` or `no_roll` status, territory identified via `resolveTerrId()`
  - [x] **Projects**: scan `projects_resolved` with ambience type, roll present; sum `roll.successes` (signed by increase/decrease)
  - [x] **Net**: sum of all columns
  - [x] **Projected step**: net > 0 → +1 step max; net < 0 → clamped to −2 steps; displayed with arrow indicator

- [x] Task 3: Live updates (AC: 10)
  - [x] Dashboard re-renders on every `renderProcessingMode()` call; reads live `submissions` array and `currentCycle.discipline_profile`
  - [x] No separate recalculate trigger needed — save callbacks already call `renderProcessingMode()`

- [x] Task 4: Discipline Profile Matrix (AC: 11, 12)
  - [x] Reads from `currentCycle.discipline_profile` (written by features 45 and 46)
  - [x] Disciplines as rows, territories as columns; only shows entries with count > 0
  - [x] Count ≥ 3 highlighted with gold colour and bold; separately collapsible

- [x] Task 5: Dashboard notes field (AC: 13)
  - [x] Textarea saved to `cycle.ambience_notes` on blur via `updateCycle()`
  - [x] `currentCycle.ambience_notes` and `allCycles[idx].ambience_notes` kept in sync after save

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | `renderAmbienceDashboard()`, live update hooks |
| `server/schemas/downtime_cycle.schema.js` | Add `ambience_notes` field |

### Territory scope

Only the five territories in `TERRITORY_DATA` (Academy, Dockyards, Harbour, North Shore, Second City) are tracked. If a project describes action in an unrecognised territory, it is not counted (the ST notes it manually).

### Relationship to existing applyAmbience

The existing `applyAmbience` button flow (in the normal DT tab view) writes ambience changes to the territories collection after the ST confirms. The dashboard does **not** replace this. It is a live preview only. The final "apply" step remains manual, using the existing wizard.

### Territory identification on actions

Actions are tagged to a territory via `responses.project_N_territory` (set in the downtime form) or by scanning `responses.project_N_description` using `getTerritoryByName()`. For the dashboard, only actions with a clearly identified territory are counted — ambiguous ones are shown in an "Unassigned" warning row in the dashboard.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Initial draft | Claude (SM) |
| 2026-04-12 | 1.1 | Implemented | Claude (Dev) |

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- `ensureTerritories()` fetches territories from `/api/territories` and caches in `cachedTerritories`; falls back to `TERRITORY_DATA` if DB is empty. Cache is cleared (`null`) on each `loadCycleById()` so starting ambience stays current.
- `resolveTerrId(raw)` normalises territory strings (territory IDs like `'academy'`, display names like `'The Academy'`, or partial matches) to TERRITORY_DATA ids.
- `buildAmbienceData()` aggregates overfeeding (from `responses.feeding_territories`), influence (from `merit_actions_resolved`), and projects (from `projects_resolved[].roll.successes`) per territory.
- Dashboard collapses independently from the Discipline Profile Matrix sub-section (`ambDashCollapsed`, `discDashCollapsed` module-level booleans).
- `ambience_notes` saved to cycle on textarea blur; `currentCycle` and `allCycles[idx]` synced in memory.
- No server schema changes needed — cycle has `additionalProperties: true`.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
