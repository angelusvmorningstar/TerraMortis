---
stepsCompleted: [1, 2, 3, 4, 5, 6, 7, 8]
inputDocuments:
  - specs/prd-dt-story.md
  - specs/architecture.md
  - specs/stories/feature.66.st-response-ambience-reference.story.md
  - CLAUDE.md
workflowType: architecture
project_name: TM Suite — DT Story Tab
user_name: Angelus
date: '2026-04-15'
status: complete
completedAt: '2026-04-15'
---

# Architecture Decision Document — DT Story Tab

---

## Project Context Analysis

### Requirements Overview

**Functional Requirements (17):**
- Tab shell and navigation: FR-DS-01, FR-DS-02 — new sub-tab pair (DT Processing / DT Story), character pill rail with completion indicators
- Section layout: FR-DS-03, FR-DS-04 — fixed 11-section order per character, standard layout pattern (context block + Copy Context + textarea + Save + Mark Complete)
- Section-specific copy context: FR-DS-05 through FR-DS-12 — each section type assembles a tailored prompt from character sheet + resolved action data + house style rules
- Non-narrative sections: FR-DS-07 (Feeding Validation), FR-DS-11 (Resources/Skills) — approval/flag toggle only, no textarea
- Storage: FR-DS-14 — all narrative in st_narrative object on submission document; no narrative on projects_resolved or merit_actions_resolved
- Migration: FR-DS-15 — feature.66 fields removed; DT1 st_response data migrated to st_narrative
- API access: FR-DS-16 — reads via API only; no import from downtime-views.js
- Cross-action chips: FR-DS-17 — client-side derivation from resolved action data

**Non-Functional Requirements (4):**
- NFR-DS-01: Module isolation — downtime-story.js has no direct imports from downtime-views.js
- NFR-DS-02: File size ceiling — 2500 lines before split; split into dt-story-narrative.js + dt-story-actions.js
- NFR-DS-03: CSS prefix — dt-story-* for all new classes
- NFR-DS-04: Read-only w.r.t. mechanical data — no pool recalculation, no matrix re-evaluation

**Scale & Complexity:**
- Primary domain: client-side JS module, existing REST API backend
- Complexity level: medium
- Estimated architectural components: 4 (tab integration, character nav, section renderer, API layer)

### Technical Constraints & Dependencies

- `downtime-views.js` is 8547 lines — no additions to this file for DT Story work
- MERIT_MATRIX and INVESTIGATION_MATRIX currently exist only in downtime-views.js (lines 1–186); must be made available to downtime-story.js without coupling
- Feature.66 fields exist in production MongoDB documents — migration must run before schema change deploys
- No new API routes required — all data accessible via existing GET /api/downtime_submissions and GET /api/characters endpoints
- DT Story tab integrates into existing admin.html tab structure — must follow the existing tab init pattern

### Cross-Cutting Concerns Identified

- **Shared constants**: MERIT_MATRIX, INVESTIGATION_MATRIX, PHASE_LABELS needed by both downtime-views.js and downtime-story.js
- **Schema migration**: st_narrative addition + feature.66 field removal is a coordinated deploy + migrate sequence
- **Cycle-wide data**: Cacophony Savvy requires all submissions for the current cycle; must be fetched once and held at module scope
- **Character sheet data**: Touchstone and territory residency data lives on character records, not submissions — requires separate character fetch on tab open
- **CSS isolation**: dt-story-* prefix prevents collision with proc-* classes from DT Processing

---

## Core Architectural Decisions

### Already Decided (Inherited from Project Architecture)

- Stack: vanilla JavaScript, no framework, static files on Netlify
- API: Express REST on Render, existing endpoints
- Database: MongoDB Atlas, existing collections
- Auth: Discord OAuth via existing admin session
- CSS: custom properties, dark theme, parchment override

### DT Story — Specific Decisions

**Constants Sharing**
- Decision: Duplicate MERIT_MATRIX and INVESTIGATION_MATRIX into downtime-story.js
- Rationale: Reference data only; avoids coupling to downtime-views.js; revisit if a third consumer appears

**API Data Loading**
- Decision: Fetch all cycle submissions AND all character records on DT Story tab open; hold at module scope
- Rationale: Single predictable upfront cost; enables Cacophony Savvy scan; touchstone + residency data available without per-character fetches; character rail re-uses cache

**st_narrative Save Pattern**
- Decision: PATCH /api/downtime_submissions/:id with `{ st_narrative: { ...patch } }`
- Rationale: Existing endpoint handles top-level field patches via MongoDB $set; no new route needed
- B1 confirmation required: verify whether the existing PATCH handler accepts dot-notation nested field updates (e.g. `{ 'st_narrative.letter_from_home.response': text }`) or requires the full st_narrative object. If full-object only: B1 implements read-merge-write pattern.

**Migration Mechanism**
- Decision: Standalone `server/migrate-dt-story.js`, run manually before B1 deploys
- Rationale: Mirrors existing migrate.js pattern; explicit operator control; safe for production
- Sequence: Run migration → verify output → deploy B1 → remove feature.66 schema fields

**Module Split Threshold**
- Decision: Single downtime-story.js to start; split at 2500 lines during development
- Split boundary: `dt-story-narrative.js` (letter/touchstone/territory) vs `dt-story-actions.js` (projects/merits/CS)

### Decision Impact Analysis

**Implementation Sequence:**
1. Migration script (before any deploy)
2. B1: tab shell + st_narrative schema + PATCH wiring + dual fetch (_allSubmissions + _allCharacters)
3. B2–B3: prompt generators (can run in parallel after B1)
4. B4–B7: section implementations (depend on B1; can run in parallel with each other)
5. A1–A2: action data completeness (parallel to B stories)

**Cross-Component Dependencies:**
- B3 (merit action prompts) benefits from A1 (cross-action markers) but does not require it
- B7 (Cacophony Savvy) requires the cycle-wide fetch established in B1
- All B stories read from st_narrative structure defined in B1 — B1 schema is the contract

---

## Implementation Patterns & Consistency Rules

### Rendering

All section renderers return HTML strings; parent sets innerHTML once. No createElement or direct DOM mutation inside section renderers.

Section root element: `<div class="dt-story-section" data-section="{key}">`

```js
// Correct
function renderLetterFromHome(char, sub, stNarrative) {
  let h = '';
  h += '<div class="dt-story-section" data-section="letter_from_home">';
  // ...
  h += '</div>';
  return h;
}
```

### Save Pattern

Single `saveNarrativeField(submissionId, patch)` function handles all PATCH calls. The patch argument is always a partial st_narrative object. No B story implements its own fetch or patch.

```js
async function saveNarrativeField(submissionId, patch) {
  await apiPatch(`/api/downtime_submissions/${submissionId}`, {
    st_narrative: patch
  });
}
```

### Copy Context Pattern

Each section has a dedicated `build*Context(char, sub)` pure function returning a string. Clipboard writing is handled by shared `copyToClipboard(text, buttonEl)` utility. Button label: "Copy Context" → "Copied!" (1500ms) → reverts; "Failed" on error.

```js
function buildLetterContext(char, sub) {
  return [
    `You are helping a Storyteller draft a narrative response...`,
    `Character: ${displayName(char)}`,
    // ...
  ].join('\n');
}
```

### Module State

Four module-scope variables only:

```js
let _allSubmissions = [];   // GET /api/downtime_submissions?cycle_id=
let _allCharacters = [];    // GET /api/characters
let _currentCharId = null;
let _currentSub = null;
```

Section-level UI state (expanded/collapsed context blocks) lives on the DOM via `data-*` attributes. Completion state is derived from st_narrative on every render — never cached separately.

### Completion Derivation

```js
function isSectionComplete(stNarrative, sectionKey) {
  return stNarrative?.[sectionKey]?.status === 'complete';
}
```

The pill rail indicators and the N/N counter both call this function. They do not maintain their own counters.

### CSS

All new classes use the `dt-story-*` prefix. No `proc-*` classes are reused in the DT Story tab. Design tokens (`--gold2`, `--surf*`, etc.) are used freely.

### Anti-Patterns

- Do not import or call any function from downtime-views.js
- Do not write narrative fields to projects_resolved or merit_actions_resolved
- Do not recalculate dice pools or apply matrix rules — read from resolved action data only
- Do not add a fifth module-scope state variable without architectural review

---

## Project Structure & Boundaries

### Files Added

```
public/js/admin/downtime-story.js
  New module. All DT Story tab logic.
  Exports: initDtStory(cycleId) — called by admin.js on tab activation.
  Internal functions follow build*/render*/save* naming.

server/migrate-dt-story.js
  One-shot migration script. Run manually before B1 deploys.
  Reads all downtime submissions; for each projects_resolved[N] with st_response,
  writes to st_narrative.project_responses[N].response, then nulls the source field.
  Does NOT drop schema fields — that is the schema update step, done separately.
  Reports: N documents updated, N responses migrated, N already empty.
```

### Files Modified

```
public/admin.html
  Add DT Story sub-tab button alongside existing DT Processing tab.
  Add container: <div id="dt-story-panel" class="dt-panel hidden">
  Add: <script src="/js/admin/downtime-story.js"></script>

public/css/admin-layout.css
  New block: /* === DT STORY TAB === */
  All new classes use dt-story-* prefix.
  No changes to existing proc-* or feed-* blocks.

server/schemas/downtime_submission.schema.js
  Add st_narrative top-level field (object, optional, additionalProperties: false).
  Remove st_response, response_author, response_status, response_reviewed_by
  from the resolvedAction definition — after migration script has run and been verified.
```

### Architectural Boundaries

DT Story reads:
- `GET /api/downtime_submissions?cycle_id={id}` → all submissions (tab open)
- `GET /api/characters` → all character records for touchstone + residency data (tab open)

DT Story writes:
- `PATCH /api/downtime_submissions/:id` body: `{ st_narrative: { ...patch } }`
- No writes to any other collection or any other field on submissions

DT Story does NOT:
- Call any function from downtime-views.js
- Write to projects_resolved or merit_actions_resolved
- Recalculate pools or apply matrix rules

### Requirements to File Mapping

| FR | File |
|----|------|
| FR-DS-01 (tab shell) | admin.html, downtime-story.js |
| FR-DS-02 (nav rail) | downtime-story.js, admin-layout.css |
| FR-DS-03–04 (section layout) | downtime-story.js, admin-layout.css |
| FR-DS-05 (letter copy context) | downtime-story.js — buildLetterContext() |
| FR-DS-06 (touchstone copy context) | downtime-story.js — buildTouchstoneContext() |
| FR-DS-07 (feeding validation) | downtime-story.js |
| FR-DS-08 (territory copy context) | downtime-story.js — buildTerritoryContext() |
| FR-DS-09 (project copy context) | downtime-story.js — buildProjectContext() |
| FR-DS-10 (merit action copy context) | downtime-story.js — buildActionContext() |
| FR-DS-11 (resources approval) | downtime-story.js |
| FR-DS-12 (cacophony savvy) | downtime-story.js — buildCacophonySavvyContext() |
| FR-DS-13 (sign-off panel) | downtime-story.js |
| FR-DS-14 (st_narrative schema) | downtime_submission.schema.js |
| FR-DS-15 (feature.66 migration) | migrate-dt-story.js, downtime_submission.schema.js |
| FR-DS-16 (API access pattern) | downtime-story.js |
| FR-DS-17 (cross-action chips) | downtime-story.js — derived client-side |

### Data Flow

```
Tab open
  → initDtStory(cycleId)
  → Promise.all([GET submissions, GET characters]) → _allSubmissions, _allCharacters
  → renderNavRail() → character pills with completion indicators

Character selected
  → _currentCharId, _currentSub set from _allSubmissions cache
  → _currentChar resolved from _allCharacters cache
  → renderCharacterView() → all section HTML → innerHTML set once

Save draft
  → saveNarrativeField(sub._id, patch)
  → PATCH /api/downtime_submissions/:id
  → re-render affected section only

Cacophony Savvy scan (on character view render)
  → scanNoisyActions(_allSubmissions, _currentCharId)
  → filters: exclude hidden (hide/protect net successes > 0), skip status
  → priority: Attack > Patrol/Scout > Investigate > Ambience > Support
  → returns first N by priority (N = CS dots); no random selection
  → passes to buildCacophonySavvyContext(char, sub, noisyActions)
```

---

## Architecture Validation Results

### Gap Found and Resolved: Character Data Fetch

FR-DS-05 (Letter from Home) and FR-DS-08 (Territory Report) require character sheet data (touchstones, haven/residency merits) that is not present on the submission document. Resolved by adding `_allCharacters` as a fourth module-scope variable, fetched on tab open via the existing `GET /api/characters` endpoint.

### B1 Confirmation Task

Confirm whether `PATCH /api/downtime_submissions/:id` accepts dot-notation nested field updates (e.g. `{ 'st_narrative.letter_from_home.response': text }`) or requires the full st_narrative object. If full-object only: B1 implements a read-merge-write pattern.

### Architecture Completeness Checklist

- [x] Requirements analysis complete (17 FR, 4 NFR)
- [x] Technical constraints identified (module isolation, migration sequencing, character data gap)
- [x] Core decisions documented (constants, fetch strategy, save pattern, migration, split threshold)
- [x] Implementation patterns defined (render, save, copy context, state, CSS, completion)
- [x] Project structure defined (2 new files, 3 modified files, data flow mapped)
- [x] Character data gap identified and resolved
- [x] PATCH endpoint ambiguity flagged for B1 confirmation
- [x] Cacophony Savvy tie-breaking rule defined (first-N by priority, no random)

### Architecture Readiness Assessment

**Overall Status:** READY FOR IMPLEMENTATION
**Confidence:** High

**Key Strengths:**
- Zero coupling between DT Story and DT Processing — stories can be implemented independently
- All narrative data in one place (st_narrative) — no hunting across arrays
- Upfront bulk fetch keeps all section renders instant after tab load
- Migration is a standalone script — safe to verify before deploying schema changes

**Deferred Decision:**
- Cacophony Savvy noisy-action tie-breaking when more actions available than CS dots → B7 resolves; default is first-N by priority order

### Implementation Handoff

All dev agents working on B1–B7 and A1–A2 stories must:
- Follow the render/save/copy context/state patterns defined above
- Use `dt-story-*` CSS prefix exclusively
- Never import from downtime-views.js
- Read the B1 PATCH confirmation note before implementing save handlers
- Reference `specs/prd-dt-story.md` for section-level requirements
