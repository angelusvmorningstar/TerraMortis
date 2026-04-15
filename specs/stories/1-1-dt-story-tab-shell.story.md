# Story 1.1: DT Story Tab Shell

## Status: ready-for-dev

## Story

**As an** ST working through a downtime cycle,
**I want** a dedicated DT Story tab with a character navigation rail and section scaffold,
**so that** I can see at a glance which characters need narrative work and jump directly to any section.

## Background

The DT Processing tab (driven by `downtime-views.js`) handles all mechanical resolution — pool validation, dice rolls, status buttons. It is 8547 lines and at capacity. All narrative authoring, prompt generation, and sign-off work is moving to a separate DT Story tab.

This story builds the shell: the sub-tab UI, the new JS module, the dual data fetch, the character navigation rail, the section scaffold, the `st_narrative` schema addition, the feature.66 migration script, and the sign-off panel.

**No narrative sections are implemented in this story** — only their empty containers with headers and completion indicators. Sections B4–B7 fill them in subsequent stories.

### Feature.66 context

Feature.66 (`specs/stories/feature.66.st-response-ambience-reference.story.md`) added four fields to `projects_resolved[N]` entries on ambience actions: `st_response`, `response_author`, `response_status`, `response_reviewed_by`. These are stored dynamically (`additionalProperties: true` on the resolvedAction schema). They must be migrated to `st_narrative.project_responses[N].response` before this story deploys to production.

### Sub-tab structure

The downtime domain currently has a single `#downtime-content` div (populated by `buildShell()` in downtime-views.js). This story wraps that in a sub-tab pattern by modifying `admin.html` and the `switchDomain` logic in `admin.js`. The DT Processing panel stays exactly as-is; the DT Story panel is added alongside it.

```
<section id="d-downtime" class="domain">
  <div class="domain-header">
    <h2>Downtime</h2>
    <div id="dt-sub-tab-bar">
      <button class="dt-sub-tab-btn active" data-tab="processing">DT Processing</button>
      <button class="dt-sub-tab-btn" data-tab="story">DT Story</button>
    </div>
  </div>
  <div id="dt-processing-panel" class="dt-panel">
    <div id="downtime-content"></div>   ← existing anchor, untouched
  </div>
  <div id="dt-story-panel" class="dt-panel" style="display:none"></div>
</section>
```

Sub-tab switching is handled in `admin.js`. `initDtStory()` is called lazily — only on first click of the DT Story tab.

### Module structure

`public/js/admin/downtime-story.js` — new ES module. No imports from `downtime-views.js`. Imports `apiGet`, `apiPut` from `../data/api.js` and `displayName` from `../data/helpers.js`.

Four module-scope state variables only:
```js
let _allSubmissions = [];   // GET /api/downtime_submissions?cycle_id=
let _allCharacters = [];    // GET /api/characters
let _currentCharId = null;
let _currentSub = null;
```

### API pattern

The submission update endpoint is **PUT** (not PATCH) at `/api/downtime_submissions/:id`. It uses MongoDB `$set` directly with the request body — so arbitrary top-level fields and dot-notation nested fields are accepted:
```js
// Updates only letter_from_home within st_narrative — MongoDB $set handles nesting
apiPut('/api/downtime_submissions/' + id, {
  'st_narrative.letter_from_home': { response: text, author: name, status: 'draft' }
});
```
This is the same `apiPut` used by `updateSubmission()` in `public/js/downtime/db.js`. Import it directly from `../data/api.js`.

### st_narrative shape

```js
// Top-level field on submission document
st_narrative: {
  locked: Boolean,
  letter_from_home:  { response: String, author: String, status: 'draft'|'complete' },
  touchstone:        { response: String, author: String, status: 'draft'|'complete' },
  feeding_validation: { approved: Boolean, flag_note: String, reviewed_by: String },
  territory_reports: [{ territory_id, territory_name, response, author, status }],
  project_responses: [{ project_index: Number, response, author, status }],
  action_responses:  [{ action_index: Number, response, author, status }],
  resource_approvals:[{ action_index: Number, approved: Boolean, flag_note, reviewed_by }],
  cacophony_savvy:   [{ slot: Number, source_action_ref: String, response, author, status }]
}
```

### saveNarrativeField

Single save function used by all B stories:
```js
async function saveNarrativeField(submissionId, patch) {
  // patch uses dot-notation for nested fields, e.g.:
  // { 'st_narrative.letter_from_home': { response: '...', author: '...', status: 'draft' } }
  return apiPut('/api/downtime_submissions/' + submissionId, patch);
}
```
Exported from the module so B stories can import it.

### Section scaffold

For this story, each section renders as a header-only placeholder:
```js
function renderSectionScaffold(key, label, hasContent) {
  const complete = isSectionComplete(_currentSub?.st_narrative, key);
  return `<div class="dt-story-section" data-section="${key}">
    <div class="dt-story-section-header">
      <span class="dt-story-section-label">${label}</span>
      <span class="dt-story-completion-dot ${complete ? 'dt-story-dot-complete' : 'dt-story-dot-pending'}"></span>
    </div>
    ${hasContent ? '' : '<div class="dt-story-section-empty">Not yet implemented</div>'}
  </div>`;
}
```
B4–B7 replace the empty body by implementing their specific renderer.

### Completion derivation

```js
function isSectionComplete(stNarrative, sectionKey) {
  return stNarrative?.[sectionKey]?.status === 'complete';
}
```
Used by both the pill rail and the sign-off counter. Never caches — always derives from `st_narrative`.

### Migration script

`server/migrate-dt-story.js` follows the `migrate.js` pattern exactly:
- Shebang: `#!/usr/bin/env node`
- ES module imports: `MongoClient` from `mongodb`, `dotenv/config`
- `--confirm` flag skips readline confirmation prompt
- Iterates all downtime_submissions; for each `projects_resolved[N]` where `st_response` is non-empty, copies to `st_narrative.project_responses[N].response`
- Sets `st_response: null` on the source entry after migration (does not remove the field — schema still has `additionalProperties: true`)
- Reports: `N submissions scanned, N responses migrated, N already null`

---

## Acceptance Criteria

1. The Downtime domain shows two sub-tab buttons: "DT Processing" and "DT Story". DT Processing is active by default.
2. Clicking DT Processing shows `#dt-processing-panel` (existing downtime content); clicking DT Story shows `#dt-story-panel`.
3. The existing downtime processing behaviour is completely unaffected — `#downtime-content` still exists inside `#dt-processing-panel` and `initDowntimeView()` still populates it.
4. `initDtStory(cycleId)` is called lazily — only on the first click of DT Story, not on every click.
5. On init, `_allSubmissions` and `_allCharacters` are fetched in parallel (`Promise.all`). A loading state is shown during fetch.
6. A character pill rail renders after fetch: one pill per submission. Pill shows `displayName(char)`. Pills with any incomplete narrative sections show an amber indicator; all-complete pills show green.
7. Clicking a character pill loads that character's full view and sets `_currentCharId` and `_currentSub`.
8. Each character view renders 11 section headers in the specified order (Letter from Home, Touchstone, Feeding Validation, Territory Report, Project Reports, Allies Actions, Status Actions, Retainer Actions, Contact Requests, Resources/Skill Acquisitions, Cacophony Savvy). Sections with no applicable content are suppressed (e.g. Cacophony Savvy suppressed if character has no CS merit).
9. A sign-off panel at the bottom of each character view shows "N/N sections complete" and a disabled "Mark all complete" button (enabled when all sections are complete).
10. `saveNarrativeField(submissionId, patch)` is exported from `downtime-story.js` and callable by all B stories.
11. `isSectionComplete(stNarrative, sectionKey)` correctly returns true only when `status === 'complete'`.
12. The migration script (`server/migrate-dt-story.js`) runs without error against the production database, reports counts, and moves any existing `st_response` values to `st_narrative.project_responses[N].response`.
13. `st_narrative` is accepted as a valid field by the submission schema (no validation errors on save).
14. No imports from `downtime-views.js` in `downtime-story.js`.
15. All new CSS classes use `dt-story-*` prefix. No `proc-*` classes used in DT Story.

---

## Tasks / Subtasks

- [ ] Task 1: admin.html — sub-tab structure
  - [ ] Wrap `<div id="downtime-content"></div>` in `<div id="dt-processing-panel" class="dt-panel">`
  - [ ] Add `<div id="dt-story-panel" class="dt-panel" style="display:none"></div>` as sibling
  - [ ] Add `<div id="dt-sub-tab-bar">` with two buttons inside `.domain-header` of `#d-downtime`
  - [ ] Add `<script src="/js/admin/downtime-story.js"></script>` import

- [ ] Task 2: admin.js — sub-tab switching + lazy init
  - [ ] Add click handler on `#dt-sub-tab-bar` buttons: toggle `.active`, toggle panel visibility
  - [ ] On first DT Story tab click: call `initDtStory(activeCycle?._id)` (one-time flag)
  - [ ] On subsequent DT Story tab clicks: show panel only (no re-init)
  - [ ] Import `initDtStory` from `./admin/downtime-story.js`

- [ ] Task 3: Create `public/js/admin/downtime-story.js`
  - [ ] Module-scope state: `_allSubmissions`, `_allCharacters`, `_currentCharId`, `_currentSub`
  - [ ] `export async function initDtStory(cycleId)`: fetch both collections in parallel, render nav rail
  - [ ] `export async function saveNarrativeField(submissionId, patch)`: thin apiPut wrapper
  - [ ] `function isSectionComplete(stNarrative, sectionKey)`: return `stNarrative?.[sectionKey]?.status === 'complete'`
  - [ ] `function renderNavRail()`: pill per submission, amber/green indicators
  - [ ] `function renderCharacterView(char, sub)`: renders all 11 section headers + sign-off panel
  - [ ] `function renderSectionScaffold(key, label)`: placeholder for unimplemented sections
  - [ ] `function renderSignOffPanel(stNarrative)`: N/N counter + Mark all complete button
  - [ ] Suppress Cacophony Savvy section if character has no CS merit (check `char.merits.find(m => m.name === 'Cacophony Savvy')`)
  - [ ] Suppress Territory Report if character has no Haven merit (or equivalent residency indicator)
  - [ ] Event delegation for pill clicks and sign-off button

- [ ] Task 4: Schema — add st_narrative
  - [ ] In `server/schemas/downtime_submission.schema.js`, add `st_narrative` as a top-level optional property (type: object, additionalProperties: true for now)
  - [ ] Do NOT remove feature.66 fields yet (migration must run first)

- [ ] Task 5: Create `server/migrate-dt-story.js`
  - [ ] Follow `migrate.js` pattern: shebang, ES module, MongoClient, dotenv/config, --confirm flag
  - [ ] Connect to `tm_suite` database, `downtime_submissions` collection
  - [ ] For each submission: iterate `projects_resolved`; if entry has non-null `st_response`, copy to `st_narrative.project_responses[n].response` (create `st_narrative` if absent), set `entry.st_response = null`
  - [ ] Use `$set` with the updated fields
  - [ ] Console report: `Scanned: N, Migrated: N, Already null: N`
  - [ ] Add usage comment at top: `# node server/migrate-dt-story.js --confirm`

- [ ] Task 6: CSS — dt-story-* block in admin-layout.css
  - [ ] Add new section: `/* ── DT Story Tab ─────────────────────────────────────────────────── */`
  - [ ] `.dt-panel` — display management (flex, hidden state)
  - [ ] `#dt-sub-tab-bar`, `.dt-sub-tab-btn`, `.dt-sub-tab-btn.active` — sub-tab bar styling
  - [ ] `.dt-story-section`, `.dt-story-section-header`, `.dt-story-section-label` — section card scaffold
  - [ ] `.dt-story-completion-dot`, `.dt-story-dot-complete`, `.dt-story-dot-pending` — amber/green indicators
  - [ ] `.dt-story-nav-rail`, `.dt-story-pill`, `.dt-story-pill.amber`, `.dt-story-pill.green` — character nav rail
  - [ ] `.dt-story-sign-off` — sign-off panel at bottom of character view

---

## Dev Notes

### File locations
| File | Action |
|------|--------|
| `public/admin.html` | Modify: wrap downtime-content, add sub-tab bar, add script import |
| `public/js/admin.js` | Modify: sub-tab click handler, lazy initDtStory call, import |
| `public/js/admin/downtime-story.js` | **Create** |
| `public/css/admin-layout.css` | Modify: add dt-story-* CSS block |
| `server/schemas/downtime_submission.schema.js` | Modify: add st_narrative top-level field |
| `server/migrate-dt-story.js` | **Create** |

### admin.js import of initDtStory
`admin.js` uses ES modules. Add to its import block:
```js
import { initDtStory } from './admin/downtime-story.js';
```
`initDtStory` is called with the current active cycle's `_id`. If no cycle is active when the tab is first clicked, pass `null` — the module should handle gracefully (show "no active cycle" message).

### Sub-tab click handler placement in admin.js
The switchDomain function (lines 175–195) handles domain switching. Sub-tab switching is a second-level concern — handle it via a delegated listener on `#dt-sub-tab-bar`, added after the downtime domain is first activated (or wired once in a DOMContentLoaded block). Only add the listener once.

### Active cycle ID for initDtStory
In `admin.js`, `activeCycle` is a variable holding the current cycle. However, `downtime-story.js` must not import `activeCycle` from `admin.js`. Instead, admin.js passes the cycle ID as a parameter: `initDtStory(activeCycle?._id || null)`.

### Cacophony Savvy detection
Merit name: `'Cacophony Savvy'` (check `MERITS_DB` in `public/js/data/merits.js` for exact casing). Check on the character object: `char.merits?.some(m => m.name === 'Cacophony Savvy')`.

### Haven / residency detection
For the Territory Report section: check `char.merits?.filter(m => m.name === 'Haven')`. If none, suppress the Territory Report section. If present, each Haven merit's `qualifier` field typically contains the territory name. Confirm this against a test character in the data.

### Suppressing Project Reports
Show up to 4 project response cards (matching `sub.projects_resolved` length, capped at 4). If `projects_resolved` is empty or absent, suppress the section.

### Suppressing action sections (Allies, Status, etc.)
`sub.merit_actions_resolved` holds all merit actions. Filter by `entry.meritCategory`:
- `'allies'` → Allies Actions section
- `'status'` → Status Actions section  
- `'retainer'` → Retainer Actions section
- `'contacts'` → Contact Requests section
- `'resources'` → Resources/Skill Acquisitions section (no narrative — approval only)
If a category has no entries, suppress its section.

### Completion count for sign-off
Count sections that are "applicable" (not suppressed) and check each against `isSectionComplete`. The sign-off panel shows `{complete}/{total} sections complete`. Mark all complete button: enabled when `complete === total`, calls `saveNarrativeField` with `{ 'st_narrative.locked': true }` then re-renders.

### CSS: dt-panel show/hide
Use `display: none` / `display: block` toggled via JS. Not `.hidden` class — downtime domain already uses `.active` for domain-level show/hide. Keep the two mechanisms separate.

### Migration: run before deploy
The migration script must be run against the production database **before** B1 is deployed to Netlify/Render. Steps:
1. `cd server && node migrate-dt-story.js` (will prompt for YES unless `--confirm` passed)
2. Verify output counts
3. Deploy B1
4. After deployment verified: optionally remove `st_response`, `response_author`, `response_status`, `response_reviewed_by` from resolvedAction schema (they remain valid due to `additionalProperties: true` but cleaning up is good hygiene)

### No downtime-views.js changes
Do NOT add any code to `downtime-views.js`. The `buildShell()` function at lines 408–433 and `initDowntimeView()` at line 7277+ are untouched. The sub-tab mechanism lives entirely in `admin.html`, `admin.js`, and `downtime-story.js`.

### getUser()
`getUser()` is defined in `admin.js` and imported into `downtime-views.js`. For `downtime-story.js`, either import it from `admin.js` (if exported) or replicate the same pattern. Check: `export function getUser()` in admin.js. If exported, import it. If not, read `localStorage.getItem('dt_user')` or the equivalent pattern used in downtime-views.js.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Angelus + Bob (SM) |

## Dev Agent Record

### Agent Model Used
_to be filled by dev agent_

### Debug Log References
_to be filled by dev agent_

### Completion Notes List
_to be filled by dev agent_

### File List
- `public/admin.html`
- `public/js/admin.js`
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
- `server/schemas/downtime_submission.schema.js`
- `server/migrate-dt-story.js`
