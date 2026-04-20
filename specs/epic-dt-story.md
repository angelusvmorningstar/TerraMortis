---
status: in-progress
version: "2.0"
date: "2026-04-20"
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

---

## Player Report Structure (v2 — 2026-04-20)

The player-facing downtime report has six sections in this order:

| # | Section | Format | Source |
|---|---------|--------|--------|
| 1 | **Story Moment** | Vignette (in-person NPC) or Letter (correspondent) — format derived from NPC relationship type | Player's NPC selection from downtime form |
| 2 | **Home Report** | Short ambient paragraph — what the character notices around where they live | `home_territory` field + cycle events near that territory |
| 3 | **Feeding** | Narrative scene | Feeding method + territory + roll result + ST notes |
| 4 | **Project Resolutions** | One narrative per project (up to 4) | Project actions + rolls + ST notes |
| 5 | **Allies & Asset Summary** | One-line ledger — all merit action outcomes | `outcome_summary` fields set during DT Processing |
| 6 | **Rumours** | 2–3 items universal + Cacophony Savvy extras | Cycle noise scan + CS merit if applicable |

**Key design decisions (from 2026-04-20 design session):**
- Territory reports are replaced by the Home Report. Players learn about territories through scouting (project actions), not a separate report.
- Story Moment replaces both Letter from Home and Touchstone Vignette. One personal interaction per cycle, format follows NPC type.
- Merit/influence actions do not receive narrative vignettes — a one-line outcome summary in the ledger is sufficient.
- Home territory is an explicit field on the character (`home_territory`), not derived from Haven merit.

---

## Stories — Active

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
- Section scaffold renders section headers per character with completion indicators (updated for v2 report structure)
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
- Output feeds into Rumours section of player report (section 6)

### Story 1.8: Action Data Completeness

**As an** ST resolving merit actions in DT Processing,
**I want** cross-action marker fields on resolved actions and automatic matrix interpretation notes,
**so that** the DT Story prompt generators have complete context without the ST manually tracking relationships.

Covers: A1 from PRD stories breakdown

Key tasks:
- Identify what cross-action markers are needed: attack/defence pairs, support links, territory overlap flags
- Add marker fields to merit_actions_resolved entries (or derive them at render time from existing data — prefer derivation over storage)
- Auto-note on matrix interpretation: when an action is marked complete in DT Processing, record what the MERIT_MATRIX / INVESTIGATION_MATRIX says that success count means as a stored note (or generate it on-the-fly in DT Story)
- Document the chosen approach so DT Story prompt generators can consume it correctly

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

### Story 1.10: Home Territory Field — DONE

**As an** ST processing a downtime,
**I want** each character to have an explicit home territory field,
**so that** I know where they live and can write a contextually grounded Home Report.

Key tasks:
- Add `home_territory` string field to character schema (values: territory names + 'Outside the City / Barrens')
- Add Home Territory selector to character editor in admin app (dropdown matching territory list)
- `home_territory` is distinct from Haven merit and feeding territory — it is where the character lives day-to-day
- Field is optional; if unset, Home Report section is suppressed for that character
- Expose `home_territory` in the DT Story character context so prompt generators can read it

### Story 1.11: Personal Story Section — Player Form (NPC Stub)

**As a** player filling out my downtime,
**I want** to choose a personal interaction with an NPC from my character's world,
**so that** I can co-author the story of my character's off-screen life.

Replaces: Court section `correspondence` field and implicit touchstone engagement. Supersedes DT Story 1.4 and 1.5 from the player form side.

Key tasks:
- Add `npcs: []` stub array to character schema — each entry: `{ id, name, relationship_type, available, touchstone_eligible, location_context, interaction_type: 'in_person'|'correspondence'|'other', interaction_history: [] }`
- New "Personal Story" section in downtime form (player.html), rendered after Court section
- If character has NPC stubs: show selectable NPC cards filtered to `available: true`
- If character has no NPCs (empty stub): show free-text field — "Who do you want to spend time with? Describe them briefly" — seeds the register organically
- Player selects NPC (or writes new), adds a note: what they want from this interaction or any direction they want to take the story
- Player can flag: "Happy with this direction" / "I'd like to redirect — [notes]"
- Response keys: `personal_story_npc_id`, `personal_story_npc_name`, `personal_story_note`, `personal_story_direction` ('continue'|'redirect')
- `collect_responses` handles both stub-picked and free-text NPC paths
- Note: `npcs` stub on character is a placeholder — full NPC Register epic will replace this with proper collections and admin UI. Code interacts with this interface; the backing store changes later.

### Story 1.12: Home Report Section — DT Story

**As an** ST writing the Home Report for a character,
**I want** a section that surfaces what's happening near the character's home territory,
**so that** I can write a short ambient paragraph grounded in real cycle events.

Replaces: Story 1.6 (Territory Report Section) — superseded.

Key tasks:
- `renderHomeReport(char, sub, stNarrative, allSubmissions)` renderer
- Only renders if `char.home_territory` is set
- Context block: territory name + current ambience, notable events in that territory this cycle (attacks, patrols, ambience actions — public-facing only; exclude hidden actions), other characters operating near home, home territory is where the character *notices things*, not where they act
- Home Report is ambient, not comprehensive — one short paragraph, not a full territory breakdown
- `buildHomeReportContext(char, allSubmissions)` pure function
- Textarea, Save Draft, Mark Complete
- `saveNarrativeField` patches `st_narrative.home_report`
- If nothing notable happened near home territory: prompt notes "quiet month near home"

### Story 1.13: Merit Summary — DT Story — DONE

**As an** ST finalising a character's downtime output,
**I want** a read-only Merit & Asset Summary section that aggregates all merit action outcome summaries,
**so that** the player receives a clear ledger of what their influence assets achieved this cycle.

Replaces: Story 1.3 (Prompt Generator — Merit Actions) — superseded. Merit actions no longer receive narrative vignettes.

Key tasks:
- `renderMeritSummary(char, sub, stNarrative)` renderer
- Reads `merit_actions_resolved[i].outcome_summary` (one-line string set during DT Processing in compact panel)
- Groups by merit category: Allies → Status → Contacts → Retainers
- Renders as a simple list: merit name/qualifier, action type, outcome summary
- Empty outcome_summary entries shown with placeholder "— Outcome not yet recorded —" to prompt ST to complete processing
- Mark Complete button when all merit actions have outcome_summary populated
- No textarea, no prompt generator — this is a read-only assembly of data already entered during processing
- `saveNarrativeField` patches `st_narrative.merit_summary_complete` (boolean flag only)

### Story 1.14: Player Report — Six-Section Delivery

**As a** player receiving my downtime results,
**I want** a structured report with my Story Moment, Home Report, Feeding, Projects, Merit Summary, and Rumours,
**so that** I can read my character's month in a clear, predictable format.

Replaces: DTP-2 (per-action project result cards) in part — this story delivers the full report structure. Coordinate with DTP epic.

Key tasks:
- Update `public/js/player/story-tab.js` to render six sections in order
- Section 1 — Story Moment: render from `st_narrative.personal_story`; format as vignette or letter based on `personal_story_npc_interaction_type`
- Section 2 — Home Report: render from `st_narrative.home_report`; suppressed if not set
- Section 3 — Feeding: render feeding narrative + roll result (from DTP-3 feeding delivery)
- Section 4 — Project Resolutions: render per-project narrative cards (from DTP-2)
- Section 5 — Allies & Asset Summary: render merit summary ledger from `st_narrative.merit_summary` or `merit_actions_resolved[i].outcome_summary`
- Section 6 — Rumours: render universal rumours + Cacophony Savvy extras from `st_narrative.rumours[]` + `st_narrative.cacophony_savvy[]`
- Privacy scrub: strip all ST-only fields before delivery (coordinate with DTP-1)
- Sections with no content (not yet written) show "Your ST is still working on this" placeholder rather than empty sections

### Story 1.15: Resident/Poacher Mismatch Flag

**As an** ST processing feeding actions,
**I want** a visual flag when a character's self-declared feeding territory status conflicts with the Regent's residency grants,
**so that** I catch poachers claiming feeding rights before I draft territory reports.

Key tasks:
- During DT Processing, for each character's feeding entry, cross-reference `responses.feeding_territories` values of `'feeding_rights'` against `territory.feeding_rights[]` array in `_territories`
- If character claims `feeding_rights` for a territory where their `_id` is NOT in `territory.feeding_rights`: flag the feeding entry with a `dt-mismatch-flag` warning badge — "Claims feeding rights — not on Regent's list"
- If character claims `poaching` for a territory where their `_id` IS in `territory.feeding_rights`: flag as "Has feeding rights — declared as poaching"
- Flags are read-only indicators in the feeding action left panel; no automatic correction
- Flag check runs at render time from in-memory territory data; no API call
- British English in all warning labels

---

## Stories — Superseded

The following stories were superseded in the v2 design session (2026-04-20). They must not be implemented. If story files exist in specs/stories/, they should be marked superseded.

### ~~Story 1.3: Prompt Generator — Merit Actions~~ — SUPERSEDED

**Superseded by:** Story 1.13 (Merit Summary). Merit actions no longer receive narrative vignettes or prompt generators. One-line outcome summaries are entered during DT Processing and assembled into a ledger. No drafting step.

### ~~Story 1.4: Letter from Home Section~~ — SUPERSEDED

**Superseded by:** Story 1.11 (Personal Story player form) + Story 1.14 (six-section report delivery). The Letter from Home is replaced by the Story Moment section, which derives its format (letter vs vignette) from the selected NPC's interaction type.

### ~~Story 1.5: Touchstone Vignette Section~~ — SUPERSEDED

**Superseded by:** Story 1.11 (Personal Story player form) + Story 1.14 (six-section report delivery). The Touchstone Vignette is replaced by the Story Moment section.

### ~~Story 1.6: Territory Report Section~~ — SUPERSEDED

**Superseded by:** Story 1.12 (Home Report). Territory reports as a per-residency authored section are replaced by the Home Report — a single ambient paragraph based on `home_territory`. Players learn about territories through scouting (project actions), not a separate report section.
