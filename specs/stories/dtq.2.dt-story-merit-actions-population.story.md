# Story DTQ.2: DT Story Merit Actions Population

Status: review

## Story

As an ST using the DT Story tab,
I want Allies, Status, Retainer, Contact, and Resources sections to appear for characters who submitted those actions,
so that I can write narrative responses for merit-based actions in the same workflow as projects.

## Acceptance Criteria

1. After loading the DT Story tab, characters with sphere actions (`sphere_N_merit` in responses) show the appropriate section(s) — Allies, Status, Resources — based on merit type.
2. Characters with contact actions (`contact_N_request` in responses) show a Contact Requests section.
3. Characters with retainer actions (`retainer_N_task` in responses) show a Retainer Actions section.
4. Each merit action card shows: merit type label, action type, desired outcome (if present), and description.
5. Submissions that already have `sub.merit_actions` populated (DT2+ format from server) are not re-processed.
6. The `merit_actions_resolved` flat index alignment is preserved — spheres first, contacts second, retainers third — matching the same ordering as `downtime-views.js`.
7. Mystery Cult Initiate actions build into `merit_actions` but are not required to appear in any section (category maps to `'misc'` which has no section — out of scope for this story).

## Tasks / Subtasks

- [x] Task 1: Add `buildMeritActions(sub)` helper function (AC: 1, 2, 3, 4, 6)
  - [x] Added to `public/js/admin/downtime-story.js` in the merit action helpers section
  - [x] Handles spheres via `_raw.sphere_actions` (DT2+) with `responses.sphere_${n}_*` fallback (DT1)
  - [x] Handles contacts via `_raw.contact_actions.requests` with `responses.contact_${n}_request` fallback
  - [x] Handles retainers via `_raw.retainer_actions.actions` with `responses.retainer_${n}_task` fallback
  - [x] Returns flat array: spheres → contacts → retainers

- [x] Task 2: Apply normalisation when loading submissions (AC: 1–6)
  - [x] `_allSubmissions` assignment replaced with `.map()` that applies `buildMeritActions` only when `sub.merit_actions` is absent/empty

- [x] Task 3: Verify sections appear for example submissions (AC: 1–4)
  - [x] 10 E2E tests added to `tests/downtime-story.spec.js` — all 10 passing

## Dev Notes

### Root Cause

`getApplicableSections()` at line 547 checks:
```js
const hasCategory = (cats) => (sub?.merit_actions || []).some(...)
```
`sub.merit_actions` is never set — data lives in `responses.sphere_N_merit` etc. — so every `hasCategory()` call returns `false` and no merit sections are added.

### Data Source Formats

**DT1 CSV format** (downtime 1, all example files in root):
- Top-level keys only: `_id`, `cycle_id`, `character_id`, `character_name`, `player_name`, `status`, `timestamp`, `attended`, `responses`
- No `_raw` field
- Merit data in `responses`: `sphere_1_merit`, `sphere_1_action`, `sphere_1_outcome`, `sphere_1_description` ... up to `sphere_5_*`
- Contacts in `responses.contact_N_request` (full blob text, n = 1..5)
- Retainers in `responses.retainer_N_task` (n = 1..4)

**DT2+ app form format**:
- Has `_raw.sphere_actions` array, `_raw.contact_actions.requests` array, `_raw.retainer_actions.actions` array
- Merit name still in `responses.sphere_N_merit` (slot = idx+1) — `_raw` entry has `action_type`, `desired_outcome`, `detail`
- See `buildProcessingQueue()` in `downtime-views.js` lines 1990–2080 for the canonical reading pattern

### Index Alignment with `merit_actions_resolved`

`merit_actions_resolved` on the submission is a parallel array: index N in `merit_actions` corresponds to index N in `merit_actions_resolved`. The ordering must be: spheres → contacts → retainers. This is the same flat index ordering used by `downtime-views.js` when building the processing queue:
```js
let meritFlatIdx = 0;
spheres.forEach(...)  { meritFlatIdx++; }   // 0 .. nSpheres-1
contacts.forEach(...) { meritFlatIdx++; }   // nSpheres .. nSpheres+nContacts-1
retainers.forEach(...)  { meritFlatIdx++; } // nSpheres+nContacts ..
```

### `buildMeritActions` Skeleton

```js
function buildMeritActions(sub) {
  const resp = sub.responses || {};
  const raw  = sub._raw || {};
  const actions = [];

  // ── Spheres ──
  const sphereRaw = raw.sphere_actions || [];
  if (sphereRaw.length) {
    sphereRaw.forEach((entry, idx) => {
      const slot = idx + 1;
      actions.push({
        merit_type:      resp[`sphere_${slot}_merit`]       || '',
        action_type:     entry.action_type                  || 'misc',
        desired_outcome: entry.desired_outcome || resp[`sphere_${slot}_outcome`] || '',
        description:     entry.detail         || resp[`sphere_${slot}_description`] || '',
      });
    });
  } else {
    for (let n = 1; n <= 5; n++) {
      const mt = resp[`sphere_${n}_merit`];
      if (!mt) continue;
      actions.push({
        merit_type:      mt,
        action_type:     resp[`sphere_${n}_action`]      || 'misc',
        desired_outcome: resp[`sphere_${n}_outcome`]     || '',
        description:     resp[`sphere_${n}_description`] || '',
      });
    }
  }

  // ── Contacts ──
  const contactRaw = raw.contact_actions?.requests || [];
  if (contactRaw.length) {
    contactRaw.forEach(c => actions.push({
      merit_type: 'Contacts', action_type: 'misc', desired_outcome: '',
      description: c.detail || c.description || '',
    }));
  } else {
    for (let n = 1; n <= 5; n++) {
      const req = resp[`contact_${n}_request`];
      if (!req) continue;
      actions.push({ merit_type: 'Contacts', action_type: 'misc', desired_outcome: '', description: req });
    }
  }

  // ── Retainers ──
  const retainerRaw = raw.retainer_actions?.actions || [];
  if (retainerRaw.length) {
    retainerRaw.forEach(r => actions.push({
      merit_type: 'Retainer', action_type: 'misc', desired_outcome: '',
      description: r.task || r.description || '',
    }));
  } else {
    for (let n = 1; n <= 4; n++) {
      const task = resp[`retainer_${n}_task`];
      if (!task) continue;
      actions.push({ merit_type: 'Retainer', action_type: 'misc', desired_outcome: '', description: task });
    }
  }

  return actions;
}
```

### What Does NOT Need to Change

- `getApplicableSections()` — already checks `sub.merit_actions` correctly
- `renderMeritSection()` / `renderAlliesSection()` etc. — already read `sub.merit_actions` correctly
- `deriveMeritCategory()` — already handles all standard merit types
- `getMeritDetails()` — already looks up dots/qualifier from character sheet
- `renderActionCard()` — already renders the full card layout

### Known Edge Case (out of scope)

Mystery Cult Initiate actions will populate `merit_actions` but `deriveMeritCategory('Mystery Cult Initiate 5')` returns `'misc'`, which has no section. These actions will be in the array but invisible in the UI. A future story can add an MCI-specific section if needed.

### References

- Loading point: `public/js/admin/downtime-story.js` line 190
- `getApplicableSections()`: lines 532–565
- `deriveMeritCategory()`: lines 1104–1113
- `renderMeritSection()`: lines 1474–1501
- DT2+ raw reading pattern: `public/js/admin/downtime-views.js` lines 1990–2080

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Added `buildMeritActions(sub)` to `downtime-story.js` merit helpers section. Handles both DT1 flat-response and DT2+ `_raw` array formats. Ordering matches `downtime-views.js` flat index: spheres → contacts → retainers.
- Two-line change to `_allSubmissions` loader applies normalisation at fetch time; pre-populated `merit_actions` is never overwritten (AC: 5).
- 10 E2E tests in `tests/downtime-story.spec.js` cover: sphere → Allies section, contact → Contact Requests, retainer → Retainer Actions, DT2 format, pre-population guard, no-merit baseline.
- Pre-existing failure in `downtime-processing-consistency.spec.js` (`targets field is a multi-select`) confirmed unrelated — fails identically on the clean base commit.

### File List

- `public/js/admin/downtime-story.js`
- `tests/downtime-story.spec.js`
- `specs/stories/dtq.2.dt-story-merit-actions-population.story.md`
