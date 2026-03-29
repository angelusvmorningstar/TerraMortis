# Epic 2: Operational Enhancement

**Status:** Backlog
**Priority:** High
**Phase:** 2 (Growth)
**Soft Deadline:** Downtime system by 8 April 2026 (Peter investigating)

## Goal

Reduce ST workload for downtime processing, game administration, and character maintenance. Automate the rules engine where it currently requires manual calculation or cross-referencing.

## Prerequisites

Epic 1 complete. Single SPA on v2 schema. Shared accessor layer in place.

## Functional Requirements

### FR-2-01: Downtime System

- FR-2-01a: ST can capture downtime submissions per character (feeding approach, downtime actions, XP spend requests)
- FR-2-01b: ST can view all pending submissions in a processing dashboard
- FR-2-01c: System calculates feeding roll outcomes from character hunting pool and approach
- FR-2-01d: System resolves territory influence generation from downtime submissions
- FR-2-01e: ST can approve, modify, or reject individual downtime outcomes
- FR-2-01f: Approved outcomes update character data (XP logs, merit changes, territory changes)
- FR-2-01g: System generates a downtime resolution summary per character

### FR-2-02: Automated Roll Workflows

- FR-2-02a: System automates feeding roll resolution (hunting pool + approach + modifiers)
- FR-2-02b: System automates territory bidding resolution (bid vs bid contested roll)
- FR-2-02c: System automates contested roll workflows for common actions (Social Manoeuvre, combat initiative, resistance)
- FR-2-02d: Roll results are stored with the session log (see FR-2-07)

### FR-2-03: MCI Benefit Grants (complete wiring)

- FR-2-03a: All `benefit_grants` on test characters are wired and rendered correctly
- FR-2-03b: System derives granted merits at render time from active MCI dot levels, checking all prerequisites
- FR-2-03c: ST can see which grants are blocked by prerequisite failures (vs. which are active)
- FR-2-03d: Suspending an MCI merit hides all derived grants from sheet and influence calculations

### FR-2-04: Professional Training Grant System

- FR-2-04a: System reads the `role` field on Professional Training merits
- FR-2-04b: System applies PT asset skills (2 Skills from role definition) to the character's skill pools
- FR-2-04c: System applies PT dot-level benefits (Contacts, Allies, etc.) as granted merits at correct dot levels
- FR-2-04d: PT grants appear on the sheet and are included in influence calculations

### FR-2-05: Character Administration

- FR-2-05a: ST can directly edit Status (city, clan, covenant) with up/down controls
- FR-2-05b: ST can directly edit Blood Potency with validation (0-10)
- FR-2-05c: ST can directly edit Humanity with validation (0-10)
- FR-2-05d: ST can render the `features` field for characters that have it populated
- FR-2-05e: ST can add/edit/remove touchstones with humanity-level association
- FR-2-05f: ST can add/edit/remove banes

### FR-2-06: Print Character Sheet

- FR-2-06a: ST can generate a print-formatted character sheet for a selected character
- FR-2-06b: Print sheet renders all attributes, skills, disciplines, powers, merits, touchstones, banes, and aspirations
- FR-2-06c: Print sheet renders derived stats (size, speed, defence, health, willpower, vitae)
- FR-2-06d: Print sheet uses a print-optimised CSS (no dark background, ink-friendly)

### FR-2-07: Session Log

- FR-2-07a: System stores session events (rolls, outcomes, narrative beats) keyed to a session date
- FR-2-07b: ST can review the log for a given session
- FR-2-07c: Log entries are associated with characters involved

### FR-2-08: GitHub API Integration

- FR-2-08a: ST can save character edits back to the GitHub repository JSON directly from the Editor, without manual file export/import
- FR-2-08b: System commits changes with a descriptive commit message (character name + change summary)
- FR-2-08c: ST is notified if the remote file has been updated since last load (conflict detection)

## Acceptance Criteria

1. Full 30-character downtime cycle completes in under 1 day of ST effort
2. Feeding rolls resolve automatically from character data with no manual lookup
3. PT and MCI grants are visible on character sheets and included in influence totals
4. `features` field renders on all 5 affected characters
5. BP, Humanity, and Status edits persist correctly to localStorage and data export
6. Print sheet renders all character data legibly without dark theme

## Technical Notes

- Downtime system deadline (8 April 2026) is aspirational. If Epic 1 is not complete by early April, the existing Google Form interim continues. Do not pull this into Epic 1 scope.
- GitHub API integration requires a personal access token or GitHub App. Sensitive credentials must not enter the repository (see NFR7).
- The `xp_log` field in HANDOVER_v4 schema shows the intended structure for XP log entries (`{ date, type, amount, note }`). Epic 2 should surface this in the UI.
