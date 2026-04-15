---
status: in-progress
version: "1.0"
date: "2026-04-15"
inputDocuments:
  - specs/prd-dt-story.md
  - specs/architecture-dt-story.md
---

# DT Story Tab — Epic Breakdown

## Epic 1: DT Story Tab

Introduce the DT Story tab as a separate, character-centric narrative authoring workspace for the ST admin app. All ST narrative drafting, prompt generation, and sign-off work moves here, cleanly separated from the mechanical DT Processing tab.

Reference documents:
- PRD: `specs/prd-dt-story.md`
- Architecture: `specs/architecture-dt-story.md`
- Prior art: `specs/stories/feature.66.st-response-ambience-reference.story.md`

### Story 1.1: DT Story Tab Shell

**As an** ST working through a downtime cycle,
**I want** a dedicated DT Story tab with a character navigation rail and section scaffold,
**so that** I can see at a glance which characters need narrative work and jump directly to any section.

Covers: FR-DS-01, FR-DS-02, FR-DS-03, FR-DS-04, FR-DS-13, FR-DS-14, FR-DS-15, FR-DS-16, NFR-DS-01, NFR-DS-02, NFR-DS-03

Key tasks:
- Add DT Processing / DT Story sub-tab pair to admin.html
- Create public/js/admin/downtime-story.js with module init, dual fetch (_allSubmissions + _allCharacters), character nav rail
- Create server/migrate-dt-story.js migration script
- Add st_narrative to downtime_submission.schema.js; remove feature.66 fields after migration
- Section scaffold renders all 11 section headers per character with completion indicators
- Sign-off panel (N/N counter + Mark all complete)
- Confirm PATCH endpoint supports dot-notation nested field updates; implement read-merge-write if not
- CSS block in admin-layout.css: dt-story-* prefix

### Story 1.2: Prompt Generator — Projects

**As an** ST drafting a narrative response for a project action,
**I want** a Copy Context button that assembles a tailored prompt capturing the project's roll result, desired outcome, and house style rules,
**so that** I can paste directly into Claude without manually gathering context.

Covers: FR-DS-09, NFR-DS-04

Key tasks:
- buildProjectContext(char, sub, projectIndex) pure function
- Captures: character name, action type, territory, title, desired outcome, description, merits/bonuses, validated pool (or player pool), roll result (dice string + successes + exceptional flag; omitted if no roll yet), any ST notes from notes_thread, house style reminder (2nd person, present tense, British English, no mechanical terms, no em dashes, ~100 words)
- copyToClipboard(text, buttonEl) shared utility — "Copy Context" → "Copied!" (1500ms) → reverts; "Failed" on error
- No Roll Needed actions: full context, no roll result line
- Skipped actions: no context button rendered

### Story 1.3: Prompt Generator — Merit Actions

**As an** ST drafting a narrative response for an Allies, Status, Retainer, or Contacts action,
**I want** a Copy Context button that captures the merit's pool formula, roll result, and matrix interpretation,
**so that** the prompt correctly reflects what that success count means for that specific action type.

Covers: FR-DS-10, NFR-DS-04

Key tasks:
- buildActionContext(char, sub, actionIndex) pure function
- Captures: action type label, merit name, merit dots, merit qualifier, pool formula + mode (rolled vs unrolled) from MERIT_MATRIX, roll result if applicable, matrix interpretation chip text (what the success count means per MERIT_MATRIX / INVESTIGATION_MATRIX), any ST notes from notes_thread, cross-action context chips (Covered / Contested / Supported / Territory overlap), house style reminder (~50 words)
- MERIT_MATRIX and INVESTIGATION_MATRIX duplicated into downtime-story.js (not imported from downtime-views.js)
- No Roll Needed actions: full context, no roll result line
- Skipped actions: no context button rendered

### Story 1.4: Letter from Home Section

**As an** ST writing the narrative Letter from Home for a character,
**I want** a section that pulls the character's touchstones and player-submitted letter and assembles a tailored Copy Context prompt,
**so that** I can draft the NPC reply with the correct voice and context.

Covers: FR-DS-05

Key tasks:
- renderLetterFromHome(char, sub, stNarrative) renderer
- Context block: character name/clan/covenant, touchstones from _allCharacters (name + relationship type), player's submitted letter text (if present), house style reminder (NPC reply, no plot hooks, match voice, ~100 words)
- buildLetterContext(char, sub) pure function
- Textarea, Save Draft, Mark Complete per standard section pattern
- saveNarrativeField patches st_narrative.letter_from_home

### Story 1.5: Touchstone Vignette Section

**As an** ST writing the Touchstone vignette for a character,
**I want** a section that looks up the character's actual touchstones on their sheet and generates a prompt specific to those relationships,
**so that** the vignette is grounded in the character's real mortal connections.

Covers: FR-DS-06

Key tasks:
- renderTouchstone(char, sub, stNarrative) renderer
- Context block: touchstone names + relationship types from _allCharacters, any touchstone-related submission content, style reminder (in-person contact, living mortal primary, first referent not a pronoun, ~100 words)
- buildTouchstoneContext(char, sub) pure function
- Textarea, Save Draft, Mark Complete
- saveNarrativeField patches st_narrative.touchstone

### Story 1.6: Territory Report Section

**As an** ST writing the Territory Report for a character,
**I want** a section that shows the relevant territory context — co-residents, discipline profile, notable events — and generates a per-territory prompt,
**so that** the narrative is grounded in what actually happened in that territory this cycle.

Covers: FR-DS-08, FR-DS-17

Key tasks:
- renderTerritoryReports(char, sub, stNarrative, allSubmissions, allChars) renderer — one sub-section per residency
- Territory residency derived from character's Haven merit (or equivalent) in _allCharacters
- Context block per territory: territory name + ambience, discipline profile (feeding/ambience actions by this character, 2+ uses threshold), co-resident characters, notable events (attacks, patrol/scout, investigations — public-facing only), cross-action chips inline (Covered / Contested / Supported / Territory overlap)
- buildTerritoryContext(char, sub, territory, allSubmissions) pure function
- Textarea, Save Draft, Mark Complete per territory sub-section
- saveNarrativeField patches st_narrative.territory_reports[n]

### Story 1.7: Cacophony Savvy Section

**As an** ST writing the Cacophony Savvy intelligence for a character with that merit,
**I want** N context slots (one per CS dot) that surface noisy public-facing actions from across the cycle,
**so that** I can write flavourful "things heard" vignettes grounded in real cycle events.

Covers: FR-DS-12

Key tasks:
- renderCacophonySavvy(char, sub, stNarrative, allSubmissions) renderer — only if character has Cacophony Savvy merit; N slots = CS dots
- scanNoisyActions(allSubmissions, charId) pure function:
  - Filters: exclude hidden (hide/protect net successes > 0), exclude skipped
  - Priority order: Attack > Patrol/Scout > Investigate > Ambience > Support
  - Returns first N entries by priority (no random selection)
  - Each entry carries: source character name, action type, territory, brief outcome
- buildCacophonySavvyContext(char, noisyAction) pure function per slot
- Textarea, Save Draft, Mark Complete per slot
- saveNarrativeField patches st_narrative.cacophony_savvy[n]
- Section suppressed entirely if character has no Cacophony Savvy merit

### Story 1.8: Action Data Completeness

**As an** ST resolving merit actions in DT Processing,
**I want** cross-action marker fields on resolved actions and automatic matrix interpretation notes,
**so that** the DT Story prompt generators have complete context without the ST manually tracking relationships.

Covers: A1 from PRD stories breakdown

Key tasks:
- Identify what cross-action markers are needed: attack/defence pairs, support links, territory overlap flags
- Add marker fields to merit_actions_resolved entries (or derive them at render time from existing data — prefer derivation over storage)
- Auto-note on matrix interpretation: when an action is marked complete in DT Processing, record what the MERIT_MATRIX / INVESTIGATION_MATRIX says that success count means as a stored note (or generate it on-the-fly in DT Story)
- Document the chosen approach so DT Story B3 (merit action prompts) can consume it correctly

### Story 1.9: Validation Button Consistency

**As an** ST reviewing merit actions in DT Processing,
**I want** consistent status buttons (Pending / Approved / No Roll Needed / Skip) across all action types,
**so that** the checklist state and DT Story prompt visibility behave predictably for every action.

Covers: A2 from PRD stories breakdown

Key tasks:
- Audit all action types in downtime-views.js for missing or inconsistent status button sets
- No Roll Needed must be present for all action types (not just merit actions)
- Skipped actions must suppress the Copy Context button in DT Story (FR-DS-10 constraint)
- Checklist state (allies/contacts section) must handle no_roll + skipped consistently
- Verify skip status is included in DONE_STATUSES for phase progress counting
