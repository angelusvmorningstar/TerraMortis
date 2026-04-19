---
id: nav.7
epic: unified-nav-polish
group: E
status: complete
priority: high
---

# Story nav.7: Downtime — Unified Tab (Merge DT Report + Submit DT)

As a player,
I want a single Downtime tab that shows my current submission form and my past outcomes in one place,
So that I can read what happened in previous cycles while writing my current downtime actions — without switching between two separate tabs.

## Background

Currently DT Report and Submit DT are two separate entries in the More grid. Players need to see past outcomes to inform their current submission, which requires switching back and forth. The fix is a single unified Downtime tab with two zones: the current cycle at the top, and a history accordion below.

This is not a toggle or a mode switcher. Both zones are always present (when data exists). The player reads history and fills the form in the same view.

### Design decisions (resolved 2026-04-19)

- No toggle, no dropdown — layout is two vertical zones, not two modes
- Current cycle zone is context-driven: the view changes based on cycle + submission state, not player choice
- History zone is always browsable; it does not replace or hide the current cycle zone
- History is absent entirely if no published outcomes exist yet — no empty box

## Layout

```
┌─────────────────────────────┐
│  CURRENT CYCLE              │  ← context-driven (see states below)
│  [form | submitted | etc.]  │
├─────────────────────────────┤
│  PAST OUTCOMES              │  ← accordion, newest first
│  ▸ Downtime 2 · Apr 2026    │
│  ▸ Downtime 1 · Feb 2026    │
└─────────────────────────────┘
```

## Acceptance Criteria

### Nav

**Given** a player views the More grid
**When** it renders
**Then** a single "Downtime" entry appears in the Player section, replacing the separate "DT Report" and "Submit DT" entries

### Current Cycle Zone — State Machine

**Given** an active cycle is open and the player has not yet submitted
**When** the Downtime tab renders
**Then** the current cycle zone shows the existing DT submission form (`renderDowntimeTab`)

**Given** an active cycle is open and the player has already submitted
**When** the Downtime tab renders
**Then** the current cycle zone shows a confirmation card: "[Cycle Label] — Submitted. Your ST is processing your actions."

**Given** no active cycle is open but a recent cycle is closed with no published outcome for this player
**When** the Downtime tab renders
**Then** the current cycle zone shows a holding card: "[Cycle Label] outcome is being processed by your Storyteller. Check back soon."

**Given** no active cycle and no relevant recent cycle
**When** the Downtime tab renders
**Then** the current cycle zone shows a neutral placeholder: "No active downtime cycle. Check with your Storyteller."

**Given** the submission form renders on a screen ≤600px wide
**When** the form loads
**Then** the existing mobile notice is shown ("This form works best on desktop") — behaviour unchanged from current implementation

### History Zone — Past Outcomes Accordion

**Given** the player has at least one closed cycle with a published outcome
**When** the Downtime tab renders
**Then** a history section appears below the current cycle zone

**Given** the history section renders
**When** the player views it
**Then** past cycles are listed newest first, each as a collapsed accordion row

**Given** an accordion row is collapsed
**When** the player views it
**Then** the row header shows: cycle label, approximate date, and "Outcome published"

**Given** an accordion row is expanded
**When** the player taps it
**Then** the full published outcome narrative is shown — same content as the existing DT Report / `renderStoryTab`

**Given** the player has no published outcomes (new player or pre-Game 1)
**When** the Downtime tab renders
**Then** the history section is absent entirely — no empty box, no label

### Multiple Outcomes

**Given** the player has multiple characters (ST or dual-role)
**When** the Downtime tab renders
**Then** it uses the same character resolution as the rest of the More grid (`_activeMoreChar()`)

## Data Sources

| Data | Endpoint | Notes |
|---|---|---|
| Active cycle | `GET /api/downtime_cycles` | Filter for `status: 'open'` |
| Player's submissions | `GET /api/downtime_submissions` | Filter by `character_id` |
| Published outcomes | From submissions where `published_outcome` is set | Already fetched above |
| History narrative | Same render function as existing DT Report tab | `renderStoryTab(el, char)` |

## Dev Notes

- Remove `dt-report` and `dt-submission` from `MORE_APPS` in `app.js`; replace with single `downtime` entry in the `player` section
- Create `public/js/player/downtime-tab.js` (or inline in app.js goTab handler) — orchestrates current zone state + history accordion
- Current zone: delegate to `renderDowntimeTab(el, char)` (submission form) or render state cards inline
- History zone: map closed cycles with published submissions → accordion rows; expand calls `renderStoryTab` into the row body
- Fetch both cycles and submissions on tab open; derive state from result — no separate API calls per zone
- History accordion uses `<details>/<summary>` or a JS toggle pattern consistent with existing expandable rows

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
Single 'Downtime' entry in Player section replaces 'DT Report' (game) and 'Submit DT' (player). Badge logic preserved on new entry. Created public/js/player/downtime-tab.js: fetches cycles+submissions once, derives current cycle state (form / submitted / processing / neutral), renders history accordion via <details>/<summary> newest-first. renderOutcomeWithCards exported from story-tab.js and reused for accordion bodies. Mobile notice preserved for ≤600px form view. History zone omitted entirely when no published outcomes. Removed renderStoryTab and renderDowntimeTab imports from app.js (both now handled inside downtime-tab.js).
### File List
- public/js/player/downtime-tab.js (new)
- public/js/player/story-tab.js (export added)
- public/js/app.js
- public/index.html
- public/css/suite.css
