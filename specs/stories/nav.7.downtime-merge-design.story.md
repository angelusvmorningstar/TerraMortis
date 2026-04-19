---
id: nav.7
epic: unified-nav-polish
group: E
status: needs-design
priority: deferred
---

# Story nav.7: Downtime — Merge DT Report + Submit DT (DESIGN REQUIRED)

## ⚠️ Design Spike Required

**Do not implement this story until a design spike has been completed.**

This story captures the intent and constraints. Before work begins, a UX design session must answer the open questions below and update this story with a concrete interaction spec and acceptance criteria.

---

## Intent

Currently DT Report and Submit DT are two separate entries in the More grid. The desired change is to merge them into a single "Downtime" button with a Read/Submit mode toggle. Read mode should be single-column and include a styled cycle dropdown for navigating between cycles.

## Known Constraints

- The underlying data sources are different: DT Report reads from `downtime_submissions` (published outcomes); Submit DT is a form that writes to `downtime_submissions`
- Submit DT is complex and form-heavy — it should not be degraded by this merge
- Read mode is the primary view for most players most of the time (between sessions)
- The cycle dropdown needs to know which cycles have published outcomes for this player
- Mobile-first: Read mode should work comfortably on a 390px screen; Submit mode can be desktop-optimised with a notice

## Open Design Questions (must be resolved in design spike)

1. What is the default mode when a player opens Downtime? Read if a published outcome exists, Submit if a cycle is open?
2. Where does the mode toggle live? Top of the panel? Tabs within the panel?
3. What does the cycle dropdown show? Cycle number + date? How many cycles back?
4. Should the two modes be visually distinct (different header colour, label) so the user always knows which mode they're in?
5. What is the empty state for Read mode when no outcome has been published yet?

## Placeholder Acceptance Criteria

*(To be replaced with real ACs after design spike)*

- Single "Downtime" entry in More grid replaces separate DT Report and Submit DT
- Tapping Downtime opens a view with a Read/Submit mode toggle
- Read mode: single-column, cycle dropdown, displays published outcome narrative
- Submit mode: existing DT submission form, unchanged functionality
- Default mode is determined by game cycle state (see open question 1)
- Cycle dropdown lists available published cycles

## Dev Agent Record
### Agent Model Used
### Completion Notes
### File List
