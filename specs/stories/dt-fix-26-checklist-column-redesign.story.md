# Story DT-Fix-26: Submission Checklist Column Redesign

Status: complete

## Story

As an ST processing a downtime cycle,
I want the submission checklist to show accurate per-section progress with the correct column set,
so that I can track which action types have been processed without misleading ? symbols or redundant columns.

## Background

The submission checklist (`renderSubmissionChecklist` in `downtime-views.js`) has three related problems:

1. **Wrong symbols for validated actions.** Projects, Allies, and Contacts show `?` even after their pool has been validated. Root cause: `_chkState` returns `'dice_validated'` or `'drafted'` for `pool_status === 'validated'`, and the cell renderer maps both of those to `?`. Under the simplified key (★ = validated, ? = some work done), both intermediate states should render as ★.

2. **Redundant columns.** Correspondence and XP are always unsighted with no automated path to ★ (no queue entry, no pool_status). They have been removed from the scope of the checklist.

3. **Column set doesn't match action taxonomy.** The current columns lump all sphere merit actions into A1–A5, missing Status and Retainer as distinct tracked types. The correct column layout is:

   `Travel | Feeding | P1 P2 P3 P4 | A1 A2 A3 A4 A5 | S1 S2 S3 | R1 R2 R3 | C1 C2 C3 C4 C5 | Resources`

   Skill Acquisition is removed — it is implemented as a personal project allocated to acquisition and needs no separate column.

---

## Acceptance Criteria

1. Checklist columns are (in order): Character, Travel, Feeding, P1–P4, A1–A5, S1–S3, R1–R3, C1–C5, Resources. No other columns.
2. ★ appears for any section whose `pool_status` is `'validated'` (or any terminal status), regardless of `response_status` or `st_response` field presence. The intermediate `dice_validated`/`drafted` distinction is removed from the cell renderer.
3. S1–S3 columns track Status merit actions (sphere_actions entries where `deriveMeritCategory(merit_type) === 'status'`). Shows `—` for characters who have fewer than N status slots.
4. R1–R3 columns track Retainer merit actions: sphere_actions entries where category is `'retainer'` or `'staff'`. Shows `—` for characters with fewer than N retainer slots.
5. A1–A5 columns track only Allies merit actions (category `'allies'`), not the full sphere_actions array.
6. C1–C5 columns are unchanged in meaning (contact_actions slots), but their flat index must now be computed correctly: `(sphere_actions.length) + (contact_slot - 1)` — sphere_actions length includes all sphere entries regardless of category.
7. Resources column tracks resource acquisitions. Shows ★ when `st_review.actions['acq:resources'].pool_status` is a terminal status (`'validated'`, `'committed'`, `'resolved'`, `'no_roll'`, `'no_action'`, `'skipped'`). Shows `?` when `sighted.resources` is manually set. Shows `O` when acquisitions content exists but no status. Shows `—` when no resource acquisitions submitted.
8. The "PROCESSED" count in the checklist header counts a submission as fully processed when every non-empty column is either ★ or X (not `O` or `?`).

---

## Tasks / Subtasks

- [x] Task 1: Update `CHK_SECTIONS` array (AC: 1)
  - [x] Remove `correspondence` and `xp` entries
  - [x] Remove `skill_acq` entry
  - [x] Replace the single `resources` entry (it stays) — no change to the key
  - [x] Add `allies_1` through `allies_5` (already present — verify labels are A1–A5)
  - [x] Add `status_1`, `status_2`, `status_3` with labels S1, S2, S3
  - [x] Add `retainers_1`, `retainers_2`, `retainers_3` with labels R1, R2, R3
  - [x] Reorder the array to: travel, feeding, project_1–4, allies_1–5, status_1–3, retainers_1–3, contacts_1–5, resources

- [x] Task 2: Add `_buildMeritSlotMap(sub)` helper (AC: 3, 4, 5, 6)
  - [x] Iterate `sub.merit_actions` (pre-built array). If absent, call `buildMeritActions`-equivalent logic inline using `sub._raw` / `sub.responses` (do NOT import from downtime-story.js — NFR-DS-01: no cross-file imports between admin JS files)
  - [x] For each entry at global flat index `i`, call `_parseMeritType(entry.merit_type)` to get `category`
  - [x] Build a map: `{ allies: [0, 3], status: [1], retainers: [2, 4], contacts: [5, 6] }` — values are global flat indices
  - [x] Return the map. This replaces the use of `_sphereCount(sub)` for contact offset calculation.

  ```javascript
  function _buildMeritSlotMap(sub) {
    const actions = sub.merit_actions || [];
    const map = { allies: [], status: [], retainers: [], contacts: [] };
    actions.forEach((a, i) => {
      const cat = _parseMeritType(a.merit_type || '').category;
      if (cat === 'allies')                         map.allies.push(i);
      else if (cat === 'status')                    map.status.push(i);
      else if (cat === 'retainer' || cat === 'staff') map.retainers.push(i);
      else if (cat === 'contacts')                  map.contacts.push(i);
    });
    return map;
  }
  ```

- [x] Task 3: Update `_chkHasContent(sub, key)` (AC: 3, 4, 5)
  - [x] Remove `correspondence` and `xp` and `skill_acq` cases
  - [x] `allies_N`: use `_buildMeritSlotMap(sub).allies[N-1] !== undefined`
  - [x] `status_N`: use `_buildMeritSlotMap(sub).status[N-1] !== undefined`
  - [x] `retainers_N`: use `_buildMeritSlotMap(sub).retainers[N-1] !== undefined`
  - [x] `contacts_N` (unchanged key): use `_buildMeritSlotMap(sub).contacts[N-1] !== undefined`
  - [x] `resources`: unchanged — `!!(raw.acquisitions?.resource_acquisitions || resp.resources_acquisitions)`

- [x] Task 4: Update `_chkState(sub, key)` (AC: 2, 3, 4, 5, 7)
  - [x] **Critical fix**: In the Projects block, change:
    ```javascript
    // BEFORE
    if (ps === 'validated') {
      if (pr.response_status === 'reviewed') return 'confirmed';
      if (pr.st_response)                    return 'drafted';
      return 'dice_validated';
    }
    // AFTER
    if (ps === 'validated') return 'confirmed';
    ```
  - [x] **Allies block**: replace current `alliesM` index logic. Use `_buildMeritSlotMap(sub).allies[idx]` to get the global flat index, then look up `resolved[globalIdx]?.pool_status`
  - [x] **Status block** (new): match `status_N` key. Use `_buildMeritSlotMap(sub).status[N-1]` → global index → `resolved[globalIdx]?.pool_status`. Terminal statuses → `'no_action'`; `'validated'` → `'confirmed'`
  - [x] **Retainers block** (new): match `retainers_N` key. Use `_buildMeritSlotMap(sub).retainers[N-1]` → global index → same logic
  - [x] **Contacts block**: replace current `_sphereCount(sub) + contactsM - 1` offset. Use `_buildMeritSlotMap(sub).contacts[N-1]` as the global index instead
  - [x] **Resources block** (updated): check `sub.st_review?.actions?.['acq:resources']?.pool_status`. Terminal statuses → `'confirmed'`; else fall through to sighted/unsighted
  - [x] Remove `skill_acq`, `correspondence`, `xp` cases

- [x] Task 5: Update `_chkNavKey(sub, section)` (AC: click-to-jump)
  - [x] `allies_N`: return `${sub._id}:merit:${_buildMeritSlotMap(sub).allies[N-1]}` (or null if undefined)
  - [x] `status_N`: return `${sub._id}:merit:${_buildMeritSlotMap(sub).status[N-1]}` (or null)
  - [x] `retainers_N`: return `${sub._id}:merit:${_buildMeritSlotMap(sub).retainers[N-1]}` (or null)
  - [x] `contacts_N`: return `${sub._id}:merit:${_buildMeritSlotMap(sub).contacts[N-1]}` (or null)
  - [x] `resources`: return `${sub._id}:acq:resources`
  - [x] Remove `correspondence`, `xp`, `skill_acq` cases

- [x] Task 6: Update cell renderer in `renderSubmissionChecklist` (AC: 2)
  - [x] Merge `'dice_validated'` and `'drafted'` into the `'confirmed'` branch — they should both render as ★
  - [x] The `sighted` state remains `?` (manually flagged in progress)
  - [x] Update legend text: `★ done  ? in progress  X skipped  O not touched  — n/a` (already updated last session; verify)

- [x] Task 7: Update `fullySighted` counter logic (AC: 8)
  - [x] Ensure `dice_validated` and `drafted` are treated as "done" in the counter (same as `confirmed`)

---

## Dev Notes

### File to modify

`public/js/admin/downtime-views.js` only. No CSS changes needed (cell classes are unchanged).

### `CHK_SECTIONS` current location

Lines ~7840–7858 in `downtime-views.js`. The array is a flat list of `{ key, label }` objects. Reorder and add/remove entries.

### `merit_actions` flat index ordering

`merit_actions_resolved` is a flat array parallel to `merit_actions` (built by `buildMeritActions` in `downtime-story.js` and replicated by `buildProcessingQueue`). Order is always:

```
[sphere_actions[0], sphere_actions[1], ..., contacts[0], contacts[1], ..., retainers[0], ...]
```

Sphere_actions contains ALL sphere merit entries in the order submitted — this includes allies, status, retainers, and other merits interleaved. The category of each is determined only by parsing `merit_type`.

### `_parseMeritType` is already in scope

`downtime-views.js` already defines `_parseMeritType(str)` which returns `{ category, label, qualifier, dots }`. Use this directly — do NOT duplicate it.

### `sub.merit_actions` availability

`merit_actions` is set on the submission object in memory by `buildMeritActions()` (called in `downtime-story.js`). In `downtime-views.js`, the same data can be reconstructed from `sub._raw.sphere_actions`, `sub._raw.contact_actions.requests`, and `sub._raw.retainer_actions.actions` (and their app-form response fallbacks). The simplest approach: check `sub.merit_actions` first; if absent, build inline.

Inline build for views.js (without importing from story.js — NFR-DS-01):
```javascript
function _getSubMeritActions(sub) {
  if (sub.merit_actions?.length) return sub.merit_actions;
  const raw  = sub._raw || {};
  const resp = sub.responses || {};
  const result = [];
  // spheres
  const spheres = raw.sphere_actions || [];
  if (spheres.length) {
    spheres.forEach((a, i) => result.push({ merit_type: resp[`sphere_${i+1}_merit`] || '', action_type: a.action_type || '' }));
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (mt) result.push({ merit_type: mt, action_type: resp[`sphere_${n}_action`] || '' });
    }
  }
  // contacts
  const contacts = raw.contact_actions?.requests || [];
  if (contacts.length) contacts.forEach(() => result.push({ merit_type: 'Contacts', action_type: '' }));
  else { for (let n = 1; n <= 5; n++) { if (resp[`contact_${n}_request`]) result.push({ merit_type: 'Contacts', action_type: '' }); } }
  // retainers
  const retainers = raw.retainer_actions?.actions || [];
  if (retainers.length) retainers.forEach(() => result.push({ merit_type: 'Retainer', action_type: '' }));
  else { for (let n = 1; n <= 4; n++) { if (resp[`retainer_${n}_task`]) result.push({ merit_type: 'Retainer', action_type: '' }); } }
  return result;
}
```

### Memoisation warning

`_buildMeritSlotMap` is called multiple times per row (once per category column). For 29 characters × ~13 columns = ~377 calls per render. Consider caching the result per sub._id within the render pass if performance is a concern. A `Map` keyed by `sub._id` populated at the start of `renderSubmissionChecklist` is the right approach.

### Terminal statuses for merit actions

```javascript
const TERMINAL_MERIT_STATUSES = new Set(['no_effect', 'resolved', 'no_action', 'no_roll', 'skipped']);
```
These → `'no_action'` (X). `'validated'` → `'confirmed'` (★). Everything else → fall through to sighted/unsighted.

### Resources acquisition state

`st_review.actions['acq:resources']` is set by `saveEntryReview` (the same mechanism used for merit/project actions). Terminal statuses for acquisitions are the same set. Check this before falling through to the sighted toggle.

### `_chkTooltip` function

Currently only handles `allies_N` and `contacts_N`. Add `status_N` and `retainers_N` cases using the same pattern: look up `sub.merit_actions[globalIdx]` and return the merit_type + action_type string.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | All changes — CHK_SECTIONS, helpers, _chkState, _chkNavKey, cell renderer |

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List
- All tasks were already implemented in a prior session; verified in `downtime-views.js` line 7901–8115
- `CHK_SECTIONS`: correct column order (T, F, P1–4, A1–5, S1–3, R1–3, C1–5, Resources) — no correspondence/xp/skill_acq
- `_getSubMeritActions` + `_buildMeritSlotMap` both exist with `sub._chkSlotMap` caching
- `_chkHasContent`: all categories handled via slot map
- `_chkState`: no `dice_validated`/`drafted` intermediate states — `ps === 'validated'` → `'confirmed'` directly for all section types
- `_chkNavKey`: all categories (allies/status/retainers/contacts) use slot map → `merit:gIdx` routing
- Cell renderer: 5-state only (empty/confirmed/no_action/sighted/unsighted)
- `fullySighted` counter: only `empty | no_action | confirmed` qualify as done

### File List
- `public/js/admin/downtime-views.js`
- `specs/stories/dt-fix-26-checklist-column-redesign.story.md`
