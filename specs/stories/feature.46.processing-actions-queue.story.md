# Story feature.46: Processing Mode — Phase 2+: Actions Queue

## Status: Approved

## Story

**As an** ST processing downtime projects and merit actions,
**I want** all actions across all characters sorted by priority type in one queue,
**so that** I can process ambience projects first (for their territory impact), then work through defensive, investigative, hostile, and other actions in the correct order without switching between submissions.

## Background

The downtime processing methodology works through action types in priority order across all characters simultaneously — not character by character. The Downtime 2 Projects document shows this directly: all ambience projects from all characters are processed first (Priority 1), then global/area effects (Priority 2), then defensive, investigative, hostile, and other.

This story implements the queue for all project and merit actions (everything except feeding and sorcery, which are feature.45 and feature.44 respectively). It builds on the infrastructure from feature.43 (backbone) — notes thread, validation state, re-tagging.

### Ambience-affecting actions and discipline × territory

When an ambience-affecting project or ally action uses a discipline in a specific territory (as noted in the validated pool and the action's territory), that discipline is recorded against that territory in the cycle's discipline profile (same model as feature.45). This is how "We Own the Night using Cruac in the Academy" gets into the discipline profile.

---

## Acceptance Criteria

1. The processing queue shows all project actions (projects 1–4 per submission) and all merit actions (sphere, contacts, allies, retainers) across all submissions for the selected cycle.
2. Actions are grouped into phase sections in this order:
   - **Ambience** — `ambience_increase`, `ambience_decrease`
   - **Defensive** — `hide_protect`
   - **Investigative** — `investigate`
   - **Hostile** — `attack`
   - **Support & Patrol** — `support`, `patrol_scout`
   - **Miscellaneous** — `misc`, `xp_spend`, unrecognised types
   - **Sphere Actions** — merit actions with type `block`, `rumour`, `grow`, `acquisition`
   - **Allies & Status** — ally/status merit actions
   - **Contacts** — contact merit actions
   - **Resources & Retainers** — resource/retainer merit actions
3. Within each phase section, actions are sorted alphabetically by character name; where a character has multiple actions of the same type, they appear sequentially.
4. Each action row shows (collapsed): character name, action type badge, project title or merit type, validation status badge.
5. Expanded action panel shows:
   - **Action type** — display label (e.g. "Ambience Increase")
   - **Project title / outcome** — from `responses.project_N_title` and `responses.project_N_outcome`
   - **Player description** — from `responses.project_N_description`
   - **Characters involved** — from `responses.project_N_cast` (if present)
   - **Merits used** — from `responses.project_N_merits`
   - **Player's pool expression** — from `responses.project_N_pool_expr` (read-only)
   - **ST validated pool** — editable (from `projects_resolved[idx].pool_validated`)
   - **Validation status** — `Pending / Validated / No Roll Needed`
   - **ST notes thread** — `projects_resolved[idx].notes_thread`
   - **Player feedback** — `projects_resolved[idx].player_feedback`
   - **Reminder badges** — from `processing_reminders` (feature.44)
   - **Roll button** — enabled when `pool_status === 'validated'`
   - **Result** — shown once rolled
6. Merit action panels show equivalent fields from `merit_actions_resolved` and the raw merit action data from the submission.
7. Rolling an action in the processing queue uses the validated pool size, stores the result in `projects_resolved[idx].roll` (existing field), and shows it inline.
8. **Discipline × territory for ambience actions**: when saving a validated pool on an ambience-type action, if the pool contains a discipline name AND the action description or `responses.project_N_territory` specifies a territory, record the discipline × territory in `cycle.discipline_profile`.
9. The ST can re-tag any action's type using the re-tag dropdown from feature.43. Re-tagging moves the action to the correct phase section immediately.
10. Actions with `action_type === 'feed'` in projects (rote feeding action) are NOT shown in this queue — they appear in the Feeding phase (feature.45).

---

## Tasks / Subtasks

- [ ] Task 1: Aggregate project and merit actions into queue (AC: 1, 2, 3)
  - [ ] Extend `buildProcessingQueue()` from feature.43 to include project slots and merit actions
  - [ ] For each submission, iterate `responses.project_N_action` (N = 1–4); skip empty slots and `feed` types
  - [ ] For each merit action: classify into phase based on merit category (sphere, contact, ally, retainer/resource) and action type
  - [ ] Sort within phases by character name then by action index

- [ ] Task 2: Expanded project action panel (AC: 5, 7)
  - [ ] Render all project fields from responses
  - [ ] Map project index to `projects_resolved[idx]` for validation state, notes thread, and result
  - [ ] If `projects_resolved[idx]` doesn't exist yet, create a skeleton entry on first save
  - [ ] Roll button: parse dice count from `pool_validated`, call `rollPool()`, store in `projects_resolved[idx].roll`, display inline

- [ ] Task 3: Expanded merit action panel (AC: 6, 7)
  - [ ] Render merit action fields from `_raw.sphere_actions[i]` or `responses.sphere_N_*` / `contact_N_*` / `retainer_N_*`
  - [ ] Map to `merit_actions_resolved[idx]` for validation state, notes thread, result
  - [ ] Allies actions within favour rating (i.e. rating ≤ allies dots): default `pool_status = 'no_roll'` and add a note "Allies action — automatic success within favour rating"
  - [ ] Roll button for merit actions that need a roll: same pattern as projects

- [ ] Task 4: Discipline × territory recording for ambience actions (AC: 8)
  - [ ] On saving `pool_status = 'validated'` for an `ambience_increase` or `ambience_decrease` action:
    - Scan `pool_validated` for known discipline names
    - Determine territory: check `responses.project_N_territory`; if not present, try to extract territory name from `responses.project_N_description` using territory name matching (same fuzzy match as existing `getTerritoryByName()`)
    - If discipline AND territory found: increment `discipline_profile[territory_id][discipline_name]` on the cycle document
  - [ ] Same deduplication logic as feature.45 (flag to prevent double-counting on re-save)

- [ ] Task 5: "No Roll Needed" default for passive actions (AC: 6)
  - [ ] Allies merit actions where `_raw.retainer_actions` or similar show a directed passive action: pre-set `pool_status = 'no_roll'`
  - [ ] The "No Roll Needed" button in the processing panel also sets `merit_actions_resolved[idx].no_roll = true` (preserving existing field)

---

## Dev Notes

### Key files

| File | Change |
|---|---|
| `public/js/admin/downtime-views.js` | Extend `buildProcessingQueue()`, project and merit action panels, roll handler, discipline recording |

### Mapping project index to projects_resolved

Projects 1–4 in responses are 1-indexed (`project_1_action`, `project_2_action`, etc.) but `projects_resolved` is 0-indexed. Map: `projIdx = N - 1`.

When saving a new note or validation state to a project that has no `projects_resolved[idx]` entry yet, create a minimal skeleton:
```js
if (!sub.projects_resolved[idx]) {
  sub.projects_resolved[idx] = { action_type: actionType, pool: null, roll: null, st_note: '', notes_thread: [], pool_player: '', pool_validated: '', pool_status: 'pending', player_feedback: '', resolved_at: null };
}
```

### Merit action index

Merit actions don't have a clean index in the submission responses (they're flat keys like `sphere_1_action`, `contact_1_request`). Map them to `merit_actions_resolved` by category + slot number. The existing per-character panel uses `_merit_pending[idx]` for transient state — the processing mode writes directly to `merit_actions_resolved[idx]` (persisted).

### rollPool() reference

The existing roll modal in `downtime-views.js` uses `showRollModal()` from `roller.js`. For the processing queue, use an inline roll (no modal) — same dice engine, result displayed in the action row directly. The result shape is the same as `projects_resolved[idx].roll`.

### What this story does NOT build

- The ambience dashboard / live calculation (feature.47)
- Investigation tracker integration (investigations are created separately in the existing tracker panel)
- Narrative drafting (existing narrative blocks in per-character view)

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
