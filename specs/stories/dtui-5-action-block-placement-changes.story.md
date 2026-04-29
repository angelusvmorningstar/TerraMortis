---
id: dtui.5
epic: dtui
status: ready-for-dev
priority: high
depends_on: [dtui.4]
---

# Story DTUI-5: Action block placement changes

As a player configuring an action,
I want Solo/Joint to be the last decision (not the first), Characters Involved removed, and the Target zone to sit in the main block flow (not inside the Joint panel),
So that I design the action fully before deciding to bring help.

---

## Context

Follows dtui-4. Makes three structural placement changes to `renderProjectSlots()` in `downtime-form.js`:

1. **Solo/Joint toggle moves from top → bottom.** Currently at lines 2807-2816 (immediately after the action-type dropdown). Must move to render after the Approach (description) textarea — the final zone before the Joint panel.

2. **Characters Involved (cast) removed.** The `cast` field (lines 2984-3002) renders a checkbox grid labelled "Characters Involved" inside the project block. This is removed entirely from the default layout. Characters are accessible only via the Joint panel invitee chip-grid (dtui-13).

3. **Target moves out of the Joint panel suppression.** Currently lines 2821-2828 suppress `target_char`, `target_flex`, and `target_own_merit` when a project is in Joint mode. This suppression is removed — target fields render regardless of Solo/Joint state. The Joint panel (dtui-12) does not contain a target selector.

### Current render order (downtime-form.js, inside renderProjectSlots()):

```
1. Action-type <select>        (lines 2790-2805)
2. Solo/Joint toggle           (lines 2807-2816)  ← moves to position 7
3. [Joint authoring panel]     (line 2814)
4. [isJoint: suppress targets] (lines 2821-2828)  ← removed
5. XP picker OR action fields  (lines 2830-3044)
   — title, target, pools, outcome, cast, description
```

### Target render order after this story:

```
1. Action-type <select>
2. [.dt-action-desc placeholder — wired in dtui-6]
3. [Outcome zone — wired in dtui-9]
4. Target zone (always in main block, never suppressed by isJoint)
5. Dice pool zone
6. Approach textarea
7. Solo/Joint .dt-ticker           ← moved here
8. [Joint panel — dtui-12 builds]
```

---

## Files in scope

- `public/js/tabs/downtime-form.js` — three targeted changes to `renderProjectSlots()`:
  1. Move Solo/Joint render block to after description render
  2. Remove cast field renders and remove `cast` from `ACTION_FIELDS`
  3. Remove the isJoint target suppression block (lines 2821-2828)

- `public/js/tabs/downtime-data.js` — remove `cast` from all entries in `ACTION_FIELDS` in `downtime-form.js` (note: ACTION_FIELDS is defined in downtime-form.js, not downtime-data.js)

---

## Out of scope

- Replacing the Solo/Joint radios with `.dt-ticker` pill styling — this story only moves the existing radio toggle to the correct position; the visual upgrade to `.dt-ticker` is also in scope here (see AC1)
- Building the Joint panel contents (dtui-12/13/14)
- Per-action target scoping (dtui-8)

---

## Acceptance Criteria

### AC1 — Solo/Joint is a `.dt-ticker` at the bottom of the action block

**Given** a player has selected a joint-eligible action type (Attack, Investigate, etc.),
**When** they scroll through the action block,
**Then** the Solo/Joint selector appears at the bottom of the block, after the Approach textarea, rendered as a `.dt-ticker` (fieldset + radio pills) with "Solo" and "Joint" options. "Solo" is selected by default.

### AC2 — Solo/Joint hidden when action not selected

**Given** a project slot has no action selected (empty action value),
**When** the pane renders,
**Then** the Solo/Joint ticker is NOT visible (only the action-type dropdown shows, per dtui-4 AC4).

### AC3 — Characters Involved absent from project block

**Given** a player views a project block with any action type selected,
**When** they inspect the rendered fields,
**Then** there is NO "Characters Involved" checkbox grid in the project block.

### AC4 — Target zone present in Solo AND Joint blocks

**Given** a player selects an action type that includes a target (e.g. Attack),
**When** the project is in Solo mode,
**Then** the target selector renders in the main block.

**Given** the same player toggles to Joint mode,
**When** the Joint panel expands,
**Then** the target selector remains in the main block body — it is NOT removed or moved to the Joint panel.

### AC5 — Existing joint invitations remain functional

**Given** a project already has an active Joint with accepted invitations,
**When** the project pane renders,
**Then** the existing Joint authoring panel (renderJointAuthoring) continues to render correctly. The action-type select lock (dtui-4 lockActionType) remains active. No regression in JDT joint flow.

---

## Implementation Notes

### 1. Replace Solo/Joint radio with `.dt-ticker`

Replace the current radio block (lines 2807-2816) with a `.dt-ticker` fieldset. The `data-project-solo-joint` attribute on the radio inputs must be preserved for the existing change handler.

Current:
```javascript
h += `<div class="qf-field dt-project-solo-joint-toggle">`;
h += `<label class="dt-project-mode-label"><input type="radio" name="dt-project_${n}_solo_joint" value="solo"${!isJoint ? ' checked' : ''} data-project-solo-joint="${n}"${existingJoint ? ' disabled' : ''}> Solo</label>`;
h += `<label class="dt-project-mode-label"><input type="radio" name="dt-project_${n}_solo_joint" value="joint"${isJoint ? ' checked' : ''} data-project-solo-joint="${n}"> Joint</label>`;
h += `</div>`;
```

Replace with `.dt-ticker` markup, moved to after the description field render. The radio `data-project-solo-joint` attribute stays — the existing change handler (`data-project-solo-joint` listener) already works by re-rendering on change.

New placement: add the Solo/Joint ticker render block AFTER the description textarea block in the field rendering loop — i.e., render it as the final field before closing `.dt-action-block`, then append `renderJointAuthoring(n, saved, existingJoint)` after it (as before, when `isJoint`).

### 2. Remove Characters Involved (cast field)

In `ACTION_FIELDS` (downtime-form.js:119-132), remove `'cast'` from every entry:

Before:
```javascript
'ambience_increase': ['title', 'territory', 'pools', 'cast', 'description'],
'ambience_decrease': ['title', 'territory', 'pools', 'cast', 'description'],
'attack':            ['title', 'target_char', 'pools', 'outcome', 'territory', 'cast', 'merits', 'description'],
'investigate':       ['title', 'target_flex', 'investigate_lead', 'pools', 'outcome', 'cast', 'merits', 'description'],
'hide_protect':      ['title', 'target_own_merit', 'pools', 'outcome', 'cast', 'merits', 'description'],
'patrol_scout':      ['title', 'pools', 'outcome', 'territory', 'cast', 'description'],
'support':           (already removed by dtui-4)
'misc':              ['title', 'pools', 'outcome', 'cast', 'description'],
```

Remove all `'cast'` entries. Also remove the `cast` field render block in `renderProjectSlots()` (approximately lines 2984-3002). The DOM elements `.dt-cast-proj-cb` will be gone; verify no JS listeners reference these for Wave 2 operations.

Also remove `'merits'` from the field lists while here — the `merits` field (`project_N_merits`) was a freetext field for "Merits/Holdings involved" which is also replaced by Joint targeting. Check what `merits` renders and remove it from ACTION_FIELDS if confirmed redundant.

### 3. Remove isJoint target suppression

Delete lines 2821-2828:
```javascript
// DELETE THIS BLOCK:
if (isJoint) {
  fields = fields.filter(f =>
    f !== 'description' &&
    f !== 'target_char' &&
    f !== 'target_flex' &&
    f !== 'target_own_merit'
  );
}
```

After this removal, `target_char`, `target_flex`, and `target_own_merit` fields render in both Solo and Joint modes.

### Preserving data: cast field

The `project_N_cast` data key continues to be collected and saved (in `collectResponses()`) for backward compatibility. The field is just not rendered anymore. New submissions will have an empty/absent cast value.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — three targeted edits: move Solo/Joint render, remove cast from ACTION_FIELDS and its render block, delete isJoint target suppression

---

## Definition of Done

- AC1–AC5 verified
- Solo/Joint ticker renders at bottom, after Approach textarea
- Characters Involved checkbox grid absent from all project blocks
- Target renders in both Solo and Joint project blocks
- No regression: existing Joint invitations continue to work; action-type lock still fires
- `specs/stories/sprint-status.yaml` updated: dtui-5 → review

---

## Compliance

- CC4 — Token discipline on new `.dt-ticker` markup (uses existing CSS classes from dtui-1)
- CC5 — "Solo" / "Joint" labels: British English compliant
- CC9 — Uses `.dt-ticker` canonical component (dtui-1)

---

## Dependencies and Ordering

- **Depends on:** dtui-4 (action block shell + `.dt-action-block` wrapper must exist)
- **Unblocks:** dtui-12 (Joint panel builds on the new bottom-position)
- Can be implemented alongside dtui-6 through dtui-11 once dtui-4 is in

---

## Dev Agent Record

### Agent Model Used

(to be filled at implementation time)

### Completion Notes

(to be filled when implemented)

### File List

(to be filled when implemented)

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-5 story drafted; ready-for-dev. |
