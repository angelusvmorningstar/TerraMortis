---
status: draft
version: "1.0"
date: "2026-04-15"
author: Angelus + Winston (Architect)
projectContext: brownfield
complexity: medium
workflowType: prd
inputDocuments:
  - specs/prd.md
  - specs/stories/feature.66.st-response-ambience-reference.story.md
  - DT Merits.xlsx (reference_dt_merits_matrix memory)
  - Downtime1_Process_Retrospective.md
  - docs/process/downtime-processing-epics.md
---

# Product Requirements Document — DT Story Tab

**Author:** Angelus + Winston (Architect)
**Date:** 15 April 2026
**Parent PRD:** `specs/prd.md` v2.0

---

## Executive Summary

The DT Story tab is a new section of the ST admin app that consolidates all narrative authoring, prompt generation, and sign-off work for a downtime cycle into a single, character-centric view. It cleanly separates narrative from mechanical processing, replacing the ad-hoc ST response fields introduced in feature.66 with a structured, complete narrative workflow.

The existing DT Processing tab retains all mechanical resolution tooling. DT Story handles everything written: letter from home, touchstone vignette, territory narrative, project and action responses, and Cacophony Savvy intelligence. Each section provides a tailored AI prompt context block and a textarea for the ST's draft, with a per-section sign-off.

---

## Problem Statement

After feature.66, narrative authoring is possible only for Ambience actions, in a panel embedded inside the mechanical processing view. As the processing panel grows to cover all action types, embedding narrative fields there creates an 8000+ line file that is already at capacity. The copy context prompt is generic. There is no unified view of "what is left to write for this character." There is no letter from home, no touchstone vignette, no territory report, no Cacophony Savvy section. The ST must mentally track what is written and what is not across an interface designed for mechanical resolution, not narrative output.

---

## Goals

- One tab, per-character, shows exactly what narrative work remains for this cycle
- Every section has a tailored AI prompt context block — the right information for that specific action type, not a generic template
- Narrative storage is clean and separate from mechanical data — no story fields on `projects_resolved` or `merit_actions_resolved`
- The feature.66 fields (`st_response`, `response_author`, `response_status`, `response_reviewed_by`) are removed from `projects_resolved` and superseded by `st_narrative`
- New module — `downtime-story.js` — keeps the downtime-views.js file from growing further

---

## Out of Scope

- Player-facing delivery of narrative outcomes (Story C — deferred, separate epic)
- Cycle reset / publish workflow (separate)
- DT Processing mechanical panel changes (separate stories in DT Processing)
- Email authentication (separate backlog)

---

## Users

**Primary:** Angelus, Symon, Kurtis (the three STs). All three may author or review narrative content. One ST typically drafts; a second marks reviewed.

---

## User Journeys

### Journey A — Authoring a full character's downtime narrative

Angelus opens DT Story. He selects a character from the pill rail — the pill shows amber indicators on two sections (Letter from Home, Territory Report). He clicks Letter from Home: the context block collapses open, showing the character's touchstones, their submitted letter-to-home text, and the house style reminder. He clicks Copy Context, pastes into Claude.ai, pastes the response back, clicks Save. The indicator goes green. He moves to Territory Report, same flow. All green — done.

### Journey B — Merit action responses

Symon picks up an allies-heavy character. Three Allies actions sit in the Allies Actions section, each as a card. For each: the action summary shows (type, merit name, dots, roll result), a matrix interpretation chip explains what that success count means for that action type, and a Copy Context button assembles a 50-word prompt. Symon writes three short responses, marks each complete.

### Journey C — Cacophony Savvy intelligence

A character has Cacophony Savvy 3. The section renders three slots. The prompt generator has scanned all resolved actions for the cycle and surfaced three "noisy" public-facing actions from other characters (not hidden, not skipped). Symon uses each slot's context block to write a brief "thing heard" vignette.

---

## Functional Requirements

### FR-DS-01: Tab Shell
The admin app's downtime section exposes two sub-tabs: **DT Processing** (existing) and **DT Story** (new). Tab labels are "DT Processing" and "DT Story".

### FR-DS-02: Character Navigation Rail
DT Story renders a horizontally scrollable pill rail at the top. Each pill shows the character's display name. Pills with any incomplete sections display an amber indicator; all-complete characters display a green indicator. Clicking a pill loads that character's full narrative view.

### FR-DS-03: Section Order
Each character's view renders sections in this fixed order, suppressing sections with no content:

1. Letter from Home
2. Touchstone
3. Feeding Validation
4. Territory Report (one sub-section per territory the character is resident in)
5. Project Reports (one card per resolved project, max 4)
6. Allies Actions (one card per resolved allies action)
7. Status Actions (one card per resolved status action)
8. Retainer Actions (one card per resolved retainer action)
9. Contact Requests (one card per resolved contacts action)
10. Resources / Skill Acquisitions (mechanical approval only — no narrative)
11. Cacophony Savvy (only if character has Cacophony Savvy merit on their sheet)

### FR-DS-04: Section Layout Pattern
Every section with narrative output follows this layout:
- Section header with section label and completion indicator
- Context block (collapsed by default once textarea has content; expandable via "Show context")
- Copy Context button assembling a tailored prompt for that section/action type
- Response textarea
- Save Draft button
- Mark Complete toggle

Sections without narrative output (Feeding Validation, Resources/Skill Acquisitions) render a pool display / approval toggle instead of a textarea and Copy Context button.

### FR-DS-05: Letter from Home — Copy Context
The prompt context block for Letter from Home captures:
- Character name, clan, covenant
- Touchstones listed on character sheet (name + relationship type)
- Player-submitted letter text from the downtime submission (if present)
- House style reminder: always a reply from the NPC, no plot hooks, match the NPC's voice, ~100 words

### FR-DS-06: Touchstone — Copy Context
The prompt context block for Touchstone captures:
- Touchstone names and relationship types (pulled live from character sheet)
- Any touchstone-related content from the downtime submission
- Style reminder: in-person contact, living mortal primary, first referent not a pronoun, ~100 words

### FR-DS-07: Feeding Validation
Feeding Validation renders a pool breakdown with an Approve / Flag toggle and a short notes field if flagging. No textarea, no Copy Context button, no narrative output. Feeding results are resolved at game, not in the downtime narrative.

### FR-DS-08: Territory Report — Copy Context
One sub-section per territory the character is resident in. The prompt context block captures:
- Territory name and current ambience level
- Discipline profile: action types used in this territory this cycle by this character, counting only feeding/ambience actions with 2+ uses threshold
- Co-resident characters (others also resident in this territory)
- Notable territory events this cycle: attacks, patrol/scout actions, investigation results (public-facing only)
- Cross-action context chips inline: Covered / Contested / Supported / Territory overlap

### FR-DS-09: Project Reports — Copy Context
One card per resolved project. The prompt context block captures:
- Project title, desired outcome, description, merits and bonuses
- Validated pool expression (or player-submitted pool if not yet validated)
- Roll result: dice string, successes, exceptional flag (omitted if no roll yet)
- Any ST notes from the notes_thread
- Style reminder: second person, present tense, British English, no mechanical terms, no em dashes, no editorialising, never dictate what the character felt or chose, ~100 words

### FR-DS-10: Merit Action Responses — Copy Context
One card per resolved action for each merit category (Allies, Status, Retainer, Contacts). The prompt context block captures:
- Action type label, merit name, merit dots, merit qualifier
- Pool formula and mode (rolled vs. unrolled) per MERIT_MATRIX
- Roll result (if applicable)
- Matrix interpretation: what that success count means for this action type per MERIT_MATRIX / INVESTIGATION_MATRIX
- Any ST notes from the notes_thread
- Cross-action context chips: Covered / Contested / Supported / Territory overlap
- Style reminder: ~50 words, same house style as projects

The prompt context block does NOT render for skipped actions. It DOES render for No Roll Needed actions (no roll result line, but full context applies).

### FR-DS-11: Resources / Skill Acquisitions
Mechanical approval only. Renders requested acquisition (merit/skill name, dots) and a prerequisite check summary. Approve / Flag toggle and short notes field. No narrative output, no Copy Context button.

### FR-DS-12: Cacophony Savvy Section
Only renders if the character has the Cacophony Savvy merit on their sheet. Renders N context slots where N = Cacophony Savvy dots.

Each slot:
- The prompt generator scans all resolved actions across all characters for the current cycle
- Filters: excludes hidden actions (hide/protect with net successes > 0), excluded actions (skip status), and investigation results returning "lead only"
- From the remainder, surfaces N entries prioritised by: public-facing territory, high success results, territory overlap with the CS character
- Priority order mirrors action taxonomy: Attack > Patrol/Scout > Investigate > Ambience > Support
- The Copy Context button packages: the noisy action summary, the CS character's sphere/territory context, and the style guide (brief overheard flavour, not direct knowledge, ~50 words)

### FR-DS-13: Sign-Off Panel
At the bottom of each character's view:
- N/N sections complete counter
- A "Mark all complete" action that locks the character's narrative for the cycle (prevents further edits)
- Lock state is stored in `st_narrative.locked: true`

### FR-DS-14: st_narrative Storage
All narrative fields are stored in a new `st_narrative` object on the downtime submission document. No narrative fields exist on `projects_resolved[N]` or `merit_actions_resolved[N]`.

The `st_narrative` object shape:

```
st_narrative: {
  locked: Boolean,
  letter_from_home: {
    response: String,
    author: String,
    status: 'draft' | 'complete'
  },
  touchstone: {
    response: String,
    author: String,
    status: 'draft' | 'complete'
  },
  feeding_validation: {
    approved: Boolean,
    flag_note: String,
    reviewed_by: String
  },
  territory_reports: [
    {
      territory_id: String,
      territory_name: String,
      response: String,
      author: String,
      status: 'draft' | 'complete'
    }
  ],
  project_responses: [
    {
      project_index: Number,   // index into projects_resolved
      response: String,
      author: String,
      status: 'draft' | 'complete'
    }
  ],
  action_responses: [
    {
      action_index: Number,    // index into merit_actions_resolved
      response: String,
      author: String,
      status: 'draft' | 'complete'
    }
  ],
  resource_approvals: [
    {
      action_index: Number,
      approved: Boolean,
      flag_note: String,
      reviewed_by: String
    }
  ],
  cacophony_savvy: [
    {
      slot: Number,
      source_action_ref: String,  // "{characterName}:{actionIndex}" pointer to noisy action
      response: String,
      author: String,
      status: 'draft' | 'complete'
    }
  ]
}
```

### FR-DS-15: Feature.66 Migration
The four fields added by feature.66 (`st_response`, `response_author`, `response_status`, `response_reviewed_by`) are removed from `projects_resolved[N]`. Any existing non-empty `st_response` values from Downtime 1 are migrated into the corresponding `st_narrative.project_responses[N].response` entry before the fields are dropped. A migration script handles this; the ST runs it via the existing `server/migrate.js` pattern.

### FR-DS-16: API Access Pattern
The `downtime-story.js` module reads all data via the existing API. It does not import from `downtime-views.js`. Required API calls:
- GET the current cycle's submissions (all characters) for character navigation and Cacophony Savvy scanning
- GET the current character's submission in full (character sheet data + resolved actions + st_narrative)
- PATCH `st_narrative` fields via the existing submission update endpoint

### FR-DS-17: Cross-Action Context Chips
Territory Report and action cards render inline context chips where applicable:
- `Covered` — a hide/protect action in this territory covered this character's actions this cycle
- `Contested` — an attack or patrol/scout targeted this merit; pair shown
- `Supported` — a support action contributed to this pool
- `Territory overlap` — another PC also acted in this territory (name shown if their action is visible)

These chips are derived from the resolved action data — no new server-side computation required.

---

## Non-Functional Requirements

### NFR-DS-01: Module isolation
`downtime-story.js` is a new file. No functions from `downtime-views.js` are called directly. Shared utilities (MERIT_MATRIX, INVESTIGATION_MATRIX, PHASE_LABELS) are either duplicated or extracted to a shared constants file if both modules need them.

### NFR-DS-02: File size
`downtime-story.js` must not exceed 3000 lines at initial implementation. If it approaches this, split by section type (narrative-letter.js, narrative-actions.js, etc.).

### NFR-DS-03: Style consistency
All new CSS classes use the `dt-story-*` prefix. No `proc-*` classes are reused in the DT Story tab. The tab follows the existing dark theme with parchment override support.

### NFR-DS-04: No mechanical recalculation
DT Story reads resolved action data — it does not recalculate pools, re-run matrix lookups, or modify mechanical fields. It is read-only with respect to mechanical data.

---

## Acceptance Criteria (Epic Level)

1. DT Processing and DT Story appear as two sub-tabs within the downtime section of the admin app
2. DT Story loads all submissions for the current cycle and renders a character pill rail
3. Each character's view renders all applicable sections in the specified order
4. Each narrative section provides a Copy Context button that assembles a tailored prompt appropriate to that section type
5. All responses are saved to `st_narrative` on the submission document — no narrative fields on `projects_resolved` or `merit_actions_resolved`
6. The feature.66 fields are absent from `projects_resolved` in both schema and UI
7. Cacophony Savvy section only renders when the character has the merit; slot count matches dots
8. The sign-off panel's N/N counter correctly reflects section completion state
9. DT Story reads data via API only — no direct coupling to downtime-views.js

---

## Stories Breakdown

| Story | Title | Scope |
|-------|-------|-------|
| B1 | DT Story tab shell | Tab, character nav rail, section scaffold, st_narrative schema, feature.66 field removal + migration |
| B2 | Prompt generator — projects | Tailored copy context for all project action types |
| B3 | Prompt generator — merit actions | Tailored copy context for Allies/Status/Retainer/Contacts actions per MERIT_MATRIX |
| B4 | Letter from Home section | Section UI, touchstone lookup, copy context, save/complete |
| B5 | Touchstone vignette section | Section UI, touchstone lookup, copy context, save/complete |
| B6 | Territory Report section | Section UI, co-resident lookup, discipline profile, cross-action chips, copy context |
| B7 | Cacophony Savvy section | Cycle-wide scan, noisy action surfacing, N-slot layout |
| A1 | Action data completeness | Cross-action marker fields, auto-note on matrix interpretation |
| A2 | Validation button consistency | No Roll Needed / Skipped / Pending state alignment across all action types |

Stories B4–B7 depend on B1. Stories B2–B3 depend on B1. A1–A2 can run in parallel with B stories.

---

## Dependencies and Risks

| Item | Risk | Mitigation |
|------|------|------------|
| feature.66 migration | Existing DT1 `st_response` data will be lost if migration is skipped | Migration script runs before any UI changes are deployed; verify all 3 ST machines have no unsaved drafts first |
| downtime-views.js coupling | Cacophony Savvy needs cycle-wide action data | API call fetches all submissions; no code import required |
| Context window size | Full architecture + all stories may exceed context | This PRD + architecture-dt-story.md serve as the multi-window anchor |
| Cacophony Savvy spec | Noisy action selection logic needs deterministic rules | Priority order defined in FR-DS-12; implemented deterministically, not randomly |

---

## Change Log

| Date | Version | Description |
|------|---------|-------------|
| 2026-04-15 | 1.0 | Initial draft — Angelus + Winston from session planning (Sally UX spec, action matrix, feature.66 prior art) |
