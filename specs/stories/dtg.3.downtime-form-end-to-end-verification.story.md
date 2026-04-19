---
id: dtg.3
epic: downtime-game-app
group: B
status: ready-for-dev
priority: high
depends_on: [dtg.1, dtg.2]
---

# Story dtg.3: Downtime Form — End-to-End Section and Save Verification

As a player using the game app,
I want every section of the downtime submission form to render correctly and save my responses,
So that I can submit a complete downtime from the game app with confidence it feeds into ST processing identically to a submission made via the player portal.

---

## Context for Dev Agent

This is a **verification and fix** story. Do NOT rewrite or redesign. Walk the form section by section in the game app (`localhost:8080/index.html`), identify broken or missing behaviour, and fix it. The form exists and mostly works — this story finds the gaps.

### What was completed in dtg.1 + dtg.2 (already done — do not redo)

- **dtg.1:** All downtime form CSS extracted from `player-layout.css` → `components.css`. Classes: `.qf-*`, `.dt-*`, `.feeding-*`, `.regency-*`, `.proj-card-*`, `.dt-split`, `.dt-hist-*` and responsive/parchment overrides.
- **dtg.2:** `suiteState.territories` is now passed through: `app.js → initDowntimeTab(el, char, territories) → renderDowntimeTab(currentZone, char, territories, { singleColumn: true })`. Regent detection now works in game app context.
- **singleColumn option:** `renderDowntimeTab` accepts `options.singleColumn`. When `true`, renders the form directly into `targetEl` — no `.dt-split` wrapper, no right-panel history. The `downtime-tab.js` already passes `{ singleColumn: true }`.
- **Dev bypass:** On `localhost`, a stub cycle `{ _id: 'dev-stub', status: 'active', label: '[Dev Preview]' }` is injected if no active cycle exists. The submitted-state gate is also bypassed on localhost (`forceForm` in `downtime-tab.js`). Saves are silently skipped when `_id === 'dev-stub'`.

### Key files

| File | Role |
|------|------|
| `public/js/player/downtime-form.js` | Main form — 3500+ lines. `renderDowntimeTab()` entry point. `renderForm()` builds all HTML. `collectResponses()` harvests field values. `saveDraft()` / `submitForm()` persist to API. |
| `public/js/player/downtime-tab.js` | Game app wrapper. Loads cycles + subs, decides which state to show, delegates to `renderDowntimeTab` with `singleColumn: true`. |
| `public/js/player/downtime-data.js` | `DOWNTIME_SECTIONS` array (12 sections), `DOWNTIME_GATES`, `SPHERE_ACTIONS`, `PROJECT_ACTIONS`, `TERRITORY_DATA`, `FEED_METHODS`, `AMBIENCE_CAP`. **Source of truth for sections and question keys.** |
| `public/js/app.js` | `goTab('downtime')` → `initDowntimeTab(el, char, suiteState.territories)`. `suiteState.territories` loaded in `loadAllData()`. |
| `public/js/dev-fixtures.js` | Loaded when `tm_auth_token === 'local-test-token'`. Provides 31 fixture characters and 5 territories. Characters include varied merits, disciplines, regent assignments. |
| `public/js/admin/downtime-views.js` | ST processing panel — reads `sub.responses.*` keys. Do not modify. Use it to verify response key shape. |
| `public/css/components.css` | Now contains all downtime form component CSS. |

### DOWNTIME_SECTIONS map (from `downtime-data.js`)

| # | key | gate | type | Notes |
|---|-----|------|------|-------|
| 1 | `court` | `attended` | Static questions | Travel, game_recount, rp_shoutout, correspondence, trust, harm, aspirations |
| 2 | `feeding` | none | `feeding_method` widget | Method selector, disc/spec dropdowns, description |
| 3 | `territory` | none | `territory_grid` + `influence_grid` | Feeding territory + influence spend |
| 4 | `regency` | `is_regent` | Textarea | Regency action question |
| 5 | `projects` | none | 4 dynamic slots | Each slot: action type + context-driven fields |
| 6 | `acquisitions` | `has_acquisitions` (manual gate) | Textarea | Resources + skill acquisitions |
| 7 | `blood_sorcery` | `has_sorcery` | Dynamic slots | Cruac/Theban rites — auto-gated by disciplines |
| 8 | `equipment` | none | Dynamic rows | Items and gear |
| 9 | `vamping` | none | Textarea | Flavour/RP |
| 10 | `admin` | none | xp_grid + textarea + star_rating | XP spend, lore request, form feedback |
| + | Spheres | per-merit toggle | Dynamic per merit | `renderMeritSections()` — detected from character.merits |
| + | Contacts | per-merit toggle | Dynamic per merit | Same |
| + | Retainers | per-merit toggle | Dynamic per merit | Same |

### Gates and auto-detection

- `gateValues.attended` — set from `/api/attendance` response (`.attended` field). Determines Court section visibility.
- `gateValues.is_regent` — set from `findRegentTerritory(_territories, char)`. Regent section visibility. **Requires territories to be passed (fixed in dtg.2).**
- `gateValues.has_sorcery` — auto-set in `renderForm()` if char has Cruac or Theban disciplines with dots > 0.
- `gateValues.has_acquisitions` — manual radio gate rendered in form body.
- Merit toggles — `detectMerits()` builds `detectedMerits.spheres`, `.contacts`, `.retainers` from `char.merits`. Each merit can be toggled on/off by the player.

### Response key conventions (must match what `downtime-views.js` reads)

- Static questions: `responses[question.key]` e.g. `responses.travel`, `responses.game_recount`
- Gate states: `responses._gate_${gate.key}` e.g. `responses._gate_attended`
- Merit toggle: `responses._merit_${meritKey(m)}`
- Feeding method: `responses._feed_method`, `responses._feed_disc`, `responses._feed_spec`, etc.
- Feeding territory grid: `responses.feeding_territories` (JSON string of `{ territory_slug: 'resident'|'poacher'|'none' }`)
- Influence grid: `responses.influence_spend` (JSON string)
- Project slots: `responses.project_N_action`, `responses.project_N_title`, `responses.project_N_territory`, `responses.project_N_description`, `responses.project_N_outcome`, `responses.project_N_cast` (JSON array of IDs), `responses.project_N_merits` (JSON array), `responses.project_N_xp`, `responses.project_N_xp_trait`
- Sphere/contact/retainer merit actions: `responses.merit_${meritKey}_action`, etc.
- Sorcery: `responses.sorcery_N_rite`, `responses.sorcery_N_description`, etc.

### How to use dev login with fixture characters

1. Navigate to `localhost:8080/dev-login.html` → Enter as Dev (ST role)
2. Navigate to `localhost:8080/index.html`
3. Use the character selector (top of sidebar or Sheet tab) to switch between fixture characters
4. Open the Downtime tab — form should render in single-column layout with `[Dev Preview]` cycle label
5. Test with characters that have different merit/discipline profiles:
   - A regent character (territory `regent_id` matches `char._id`) — verify Regency section appears
   - A character with Cruac or Theban — verify Blood Sorcery section appears
   - A character with Allies/Status/Contacts — verify sphere/contact merit sections appear
   - A character who attended the last game — verify Court section appears

### Critical: do NOT break player.html

`player.html` uses `renderDowntimeTab(el, char, territories)` **without** `{ singleColumn: true }`. The two-pane split layout and right-panel history must continue to work there. Any fix to shared logic in `downtime-form.js` must be tested in both contexts.

---

## Acceptance Criteria

### Section Rendering

**Given** a character who attended last game  
**When** the Downtime tab opens in the game app  
**Then** the Court section is visible and all 7 questions render with correct input types

**Given** any character  
**When** the Downtime tab opens  
**Then** the Feeding section renders with the feeding method widget (method selector visible, description textarea present)

**Given** any character  
**When** the Downtime tab opens  
**Then** the Territory section renders with the feeding territory grid (5 territory rows, radio buttons: Resident / Poacher / Not Feeding)

**Given** a regent character (character whose `_id` matches a territory's `regent_id` in `suiteState.territories`)  
**When** the Downtime tab opens  
**Then** the Regency section is visible and the status badge shows "Regent — [Territory Name]"

**Given** a non-regent character  
**When** the Downtime tab opens  
**Then** the Regency section is absent

**Given** any character  
**When** the Downtime tab opens  
**Then** the Projects section renders with 4 project slot tabs, each with an action type selector

**Given** a character with Cruac dots > 0 or Theban dots > 0  
**When** the Downtime tab opens  
**Then** the Blood Sorcery section is visible

**Given** a character with no Cruac or Theban disciplines  
**When** the Downtime tab opens  
**Then** the Blood Sorcery section is absent

**Given** a character with Allies, Status, or Contacts merits  
**When** the Downtime tab opens  
**Then** merit toggle rows appear for each detected merit and can be expanded

### Project Slot Fields

**Given** a project slot with action type = `ambience_increase`, `ambience_decrease`, `attack`, `investigate`, `hide_protect`, `patrol_scout`, or `support`  
**When** the action is selected  
**Then** the following fields appear: Title, Territory (dropdown), Dice Pools, Cast Picker, Merit Selector, Description

**Given** a project slot with action type = `xp_spend`  
**When** the action is selected  
**Then** the XP spend note textarea and trait selector appear

**Given** a project slot with action type = `feed`  
**When** the action is selected  
**Then** the feed summary/method field appears

### Response Collection

**Given** a player fills in fields across Court, Feeding, Territory, and Projects  
**When** `collectResponses()` runs (triggered by auto-save)  
**Then** all field values are captured under the correct `responses.*` keys (see key conventions above)

**Given** the Territory grid is filled  
**When** responses are collected  
**Then** `responses.feeding_territories` is a valid JSON string (parseable by `JSON.parse`)

**Given** a project cast picker has characters selected  
**When** responses are collected  
**Then** `responses.project_N_cast` is a valid JSON array of character ID strings

### Save Behaviour

**Given** the dev bypass is active (localhost, stub cycle)  
**When** any field is edited (auto-save fires)  
**Then** `[Dev] Save skipped` appears briefly in the save status — no error, no API call

**Given** the form is running on production (real cycle)  
**When** a field is edited and the auto-save debounce fires (~1s)  
**Then** `Saved` appears briefly — a POST (new) or PUT (existing) reaches `/api/downtime_submissions`

### Single-Column Layout

**Given** the game app Downtime tab renders  
**When** the form is visible  
**Then** there is NO `.dt-split` wrapper — the form renders directly in the tab content area  
**Then** there is NO right-panel history column — history is in the separate `dt-history-zone` below (handled by `downtime-tab.js`)

### No Regression on player.html

**Given** a player opens `player.html` Downtime tab  
**When** the form renders  
**Then** the two-pane `.dt-split` layout is intact (form left, history right)  
**Then** all sections render identically to before this story

---

## Out of Scope

- Redesigning any section UI
- Adding new questions or sections to the form
- ST processing panel changes
- Changing response key names (ST processing panel depends on them)
- The Regency residency grid (rendered in a separate Regency tab in player.html — not part of the game app form)

---

## Implementation Approach

1. Boot dev server (`cd server && npm run dev` + `npx http-server public -p 8080`)
2. Log in via `localhost:8080/dev-login.html` (ST role)
3. Open `localhost:8080/index.html` → Downtime tab
4. Walk each section systematically — open browser DevTools console
5. For each broken element: identify the root cause in `downtime-form.js`, fix minimally, verify fix doesn't break `player.html`
6. Use `collectResponses()` output (add a `console.log` temporarily if needed) to verify response key shape
7. Cross-reference against `downtime-views.js` response key reads to confirm alignment

---

## Files Expected to Change

- `public/js/player/downtime-form.js` — primary fix target
- `public/js/player/downtime-tab.js` — if game-app-specific wiring issues found
- `public/js/player/downtime-data.js` — only if section definitions need correction
- `public/css/components.css` — only if CSS gaps remain after dtg.1

## Dev Agent Record
### Agent Model Used
_to be filled_
### Completion Notes
_to be filled_
### File List
_to be filled_
