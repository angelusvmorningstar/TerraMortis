# Story feature.46: Processing Mode — Phase 2+: Actions Queue

## Status: review

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

- [x] Task 1: Aggregate project and merit actions into queue (AC: 1, 2, 3)
  - [x] `feed` action type projects skipped (AC10) — they appear in the feeding phase
  - [x] Project entries carry `projSlot`, `projTitle`, `projOutcome`, `projCast`, `projMerits`, `projTerritory`
  - [x] Merit phases already correctly classified in feature.43; `isAlliesAction` flag added to sphere entries

- [x] Task 2: Expanded project action panel (AC: 5, 7)
  - [x] Project detail block (title, outcome, territory, cast, merits) shown in expanded panel
  - [x] Skeleton entry created in `saveEntryReview` with `action_type`, null roll, empty thread, etc.
  - [x] Roll button appears when `pool_status === 'validated'`; uses `rollPool()`, stores in `projects_resolved[idx].roll`; result shown inline

- [x] Task 3: Expanded merit action panel (AC: 6, 7)
  - [x] Previous roll result shown inline above validation buttons
  - [x] Allies hint: "typically automatic — consider No Roll Needed" shown when `isAlliesAction && pending`
  - [x] Roll button same as projects; stores in `merit_actions_resolved[idx].roll`

- [x] Task 4: Discipline × territory recording for ambience actions (AC: 8)
  - [x] `recomputeDisciplineProfile()` extended to scan ambience `projects_resolved` entries
  - [x] Triggered fire-and-forget from `saveEntryReview` project case when ambience type + pool change

- [x] Task 5: "No Roll Needed" default for passive actions (AC: 6)
  - [x] `isAlliesAction` hint shown; `no_roll` button already present via shared validation buttons — ST clicks manually

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

claude-sonnet-4-6

### Completion Notes

- `feed` action type filtered from projects in `buildProcessingQueue` (AC10).
- Project queue entries now carry `projSlot`, `projTitle`, `projOutcome`, `projCast`, `projMerits`, `projTerritory` sourced from flat responses.
- Expanded panel shows a `.proc-proj-detail` block for projects with extra fields.
- Roll button (`proc-action-roll-btn`) shared for both projects and merit actions; uses `rollPool()` directly (no modal); result stored in `projects_resolved[idx].roll` or `merit_actions_resolved[idx].roll`.
- Allies hint (`.proc-allies-hint`) shown when `isAlliesAction === true && poolStatus === 'pending'`.
- `recomputeDisciplineProfile()` extended to scan `projects_resolved` ambience entries using `project_N_territory` response field.
- Skeleton `projects_resolved` entry now includes `action_type`, `pool: null`, `roll: null`, `st_note: ''` for backwards compat.

### File List

- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
