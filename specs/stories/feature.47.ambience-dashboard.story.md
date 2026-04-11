# Story feature.47: Processing Mode — Ambience Dashboard

## Status: Approved

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

- [ ] Task 1: Ambience dashboard panel (AC: 1, 2)
  - [ ] Add a collapsible "Ambience Dashboard" section to the Processing Mode view, above the phase sections (always visible)
  - [ ] Render a table: Territory | Starting | Entropy | Overfeeding | Influence | Projects | Net Change | Projected Step

- [ ] Task 2: Data aggregation for each column (AC: 3–9)
  - [ ] **Starting**: read territory `ambience` field from the `territories` collection (loaded at startup in `admin.js`)
  - [ ] **Entropy**: hardcode −1 per territory
  - [ ] **Overfeeding**: count characters with `resident` or `poach` status per territory from all `responses.feeding_territories` in the cycle; compare to `AMBIENCE_CAP[startingAmbience]`; overfeeding penalty = max(0, feederCount − cap)
  - [ ] **Influence**: scan all `merit_actions_resolved` and `projects_resolved` where `action_type === 'ambience_increase'` or `ambience_decrease` AND the action is tagged to a territory AND `pool_status === 'validated'` or `pool_status === 'no_roll'`; count resolved ally/influence actions (+1 each)
  - [ ] **Projects**: scan all `projects_resolved` where `action_type === 'ambience_increase'` or `ambience_decrease` AND tagged to a territory AND `roll` is present; sum `roll.successes` (positive for increase, negative for decrease)
  - [ ] **Net**: sum all columns
  - [ ] **Projected step**: current step ± (net > 0 ? min(1, positive steps) : max(-2, negative steps)); display new step name

- [ ] Task 3: Live updates (AC: 10)
  - [ ] Ambience dashboard reads from the in-memory `submissions` array and `cycle.discipline_profile`
  - [ ] It re-renders whenever a project or merit action is saved (validation state change, roll result saved)
  - [ ] No separate "recalculate" trigger — the same save callbacks that update `submissions[i]` also trigger a dashboard re-render

- [ ] Task 4: Discipline Profile Matrix (AC: 11, 12)
  - [ ] Read from `cycle.discipline_profile` (written by features 45 and 46)
  - [ ] Render as a matrix: disciplines as rows, territories as columns
  - [ ] Only include disciplines and territories with count > 0
  - [ ] Cells show the count; highlight cells with count ≥ 3 (high discipline presence)

- [ ] Task 5: Dashboard notes field (AC: 13)
  - [ ] A textarea below the discipline profile, saved to `cycle.ambience_notes` (new field)
  - [ ] Saved on blur via `apiPut('/api/downtime_cycles/' + selectedCycleId, { ambience_notes: value })`
  - [ ] ST-only, never shown to players

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

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
