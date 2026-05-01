---
id: dtui.4
epic: dtui
status: review
priority: high
depends_on: [dtui.1, dtui.2, dtui.3]
---

# Story DTUI-4: `.dt-action-block` stable shell structure

As a player configuring a downtime action,
I want the project/merit-action block to have a consistent outer shape with a fixed flow order,
So that I know exactly where each input lives regardless of which action I picked.

---

## Context

Wave 2 first story. Introduces the `.dt-action-block` CSS wrapper and establishes the zone-ordered render sequence for Personal Project slots. Removes "Support" from the Personal Projects action-type dropdown.

The current render function `renderProjectSlots()` (`downtime-form.js:2589`) outputs fields in an ad-hoc order inherited from the `ACTION_FIELDS` map (`downtime-form.js:119-132`). The Solo/Joint toggle is rendered at **lines 2807-2816 — immediately after the action-type dropdown**, before any action fields. The target zone, dice pool, and description follow in the loop that reads `ACTION_FIELDS[actionVal]`.

The desired zone order (fixed outer shape) is:
1. Action-type `<select>` (always)
2. `.dt-action-desc` — descriptive copy (dtui-6 wires content; dtui-3 supplies the CSS)
3. Outcome zone (dtui-9 wires per-action treatment)
4. Target zone (dtui-8 wires per-action scoping)
5. Dice pool zone
6. Approach textarea (dtui-7 wires label + prompt; currently called "Description")
7. Solo/Joint `.dt-ticker` (dtui-5 moves this from top → bottom)
8. Joint panel (dtui-12 builds this panel)

This story does the minimum required to establish the zone wrapper and remove Support:
- Adds CSS zone classes
- Removes `support` from `PROJECT_ACTIONS` (data) and `ACTION_FIELDS` (render map)
- Wraps each project pane's body in `.dt-action-block`
- Adds backward-compat for existing submissions with `action_type: 'support'`

**What this story does NOT do** (covered by subsequent stories):
- Moving Solo/Joint to the bottom — dtui-5
- Removing Characters Involved (cast) — dtui-5
- Wiring `.dt-action-desc` content — dtui-6
- Renaming Description → Approach — dtui-7
- Per-action target scoping — dtui-8
- Per-action outcome treatments — dtui-9

---

## Files in scope

- `public/css/components.css` — add `.dt-action-block` zone CSS after the existing DTUI section
- `public/js/tabs/downtime-data.js` — remove `support` entry from `PROJECT_ACTIONS` (line 18)
- `public/js/tabs/downtime-form.js` — remove `support` from `ACTION_FIELDS` (line 129); wrap project pane body in `.dt-action-block`; add legacy notice for saved `action_type === 'support'`

---

## Out of scope

- SPHERE_ACTIONS (Allies dropdown) — dtui-15 handles Allies parity including support removal there
- Solo/Joint placement — dtui-5
- Characters Involved removal — dtui-5
- Per-action descriptions, prompts, target scoping, outcome treatments — dtui-6 through dtui-11

---

## Acceptance Criteria

### AC1 — `.dt-action-block` wrapper present

**Given** a project slot tab pane renders with any action type selected,
**When** the DOM is inspected,
**Then** the form fields within the pane are wrapped in a `<div class="dt-action-block">` element.

### AC2 — Support absent from Personal Projects dropdown

**Given** a player views a Personal Project action-type dropdown,
**When** they inspect the options,
**Then** "Support" is NOT listed. The remaining options are: No Action Taken, Ambience Change (Increase), Ambience Change (Decrease), Attack, Hide/Protect, Investigate, Patrol/Scout, XP Spend, Misc, Maintenance.

### AC3 — Backward compat for saved Support actions

**Given** a character's saved form has `project_N_action: 'support'` from a previous cycle,
**When** the project pane renders,
**Then** a grey legacy notice is shown: "This action type is no longer available. Please select a new action type." The pane does NOT crash or render empty.

### AC4 — Empty block shows only action-type dropdown

**Given** a project slot has no action selected (empty value),
**When** the pane renders,
**Then** only the action-type `<select>` is visible inside `.dt-action-block`. No Solo/Joint toggle, no action-specific fields, no dice pool.

### AC5 — Compatible field values preserved on action change

**Given** a player has filled in an Approach text for one action type, then changes to another action that also has an Approach field,
**When** the re-render fires,
**Then** the Approach textarea retains its previous text. Pool selections are also preserved where compatible.

---

## Implementation Notes

### CSS additions (components.css)

Add to the "Form components — DTUI" section after `.dt-action-desc`:

```css
/* .dt-action-block — stable shell container for project/merit-action fields */
.dt-action-block {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
```

No zone sub-classes needed in this story — the column gap provides visual separation between zones. Per-zone modifiers (`.dt-action-block__zone--target`, etc.) can be added by consuming stories if needed.

### Data changes (downtime-data.js)

Remove the `support` entry from `PROJECT_ACTIONS` (line 18):
```javascript
// DELETE this line:
{ value: 'support', label: 'Support: Assists any other action type by you or another' },
```

`SPHERE_ACTIONS` retains `support` — that's handled by dtui-15.
`JOINT_ELIGIBLE_ACTIONS` does NOT include `support` (per existing comment at line 94), so no change needed there.

### JS changes (downtime-form.js)

**1. Remove `support` from ACTION_FIELDS (line 129):**
```javascript
// DELETE this line from ACTION_FIELDS:
'support': ['title', 'pools', 'outcome', 'cast', 'description'],
```

**2. Wrap project pane body in `.dt-action-block`:**
In `renderProjectSlots()`, the project tab pane body begins after the tab bar. Find the point where pane content starts (around line 2788) and wrap the fields section. The existing pane outer `<div>` remains; `.dt-action-block` wraps the inner fields only.

Pattern: after the opening pane `<div>`, add `h += '<div class="dt-action-block">';` and at the end (before closing pane `</div>`), add `h += '</div>';`.

**3. Add backward-compat for saved `support` action (around line 2790):**
```javascript
if (actionVal === 'support') {
  h += '<p class="qf-desc dt-action-legacy-notice">This action type is no longer available. Please select a new action type.</p>';
  // continue to still render the action-type dropdown (so player can change it)
}
```
Place this check immediately after the action-type `<select>` renders but before the action-specific fields loop.

### Preserving field values on action change (AC5)

The current render already preserves values: every field reads from the `saved` object (e.g. `saved[project_${n}_description]`). When the player changes action type:
- `scheduleSave()` saves the current field values
- Re-render reads all values from `saved`
- Fields present in the new action type are pre-filled from saved values
- Fields absent in the new action type simply don't render (their saved values persist in the object but aren't displayed)

No additional code needed for AC5 — this is existing behaviour. Verify by testing action type change with text already in the description textarea.

---

## Files Expected to Change

- `public/css/components.css` — add ~6 lines for `.dt-action-block`
- `public/js/tabs/downtime-data.js` — remove 1 line (support from PROJECT_ACTIONS)
- `public/js/tabs/downtime-form.js` — remove 1 line (support from ACTION_FIELDS); add ~3 lines wrapper; add ~5 lines backward-compat notice

---

## Definition of Done

- AC1–AC5 verified
- `.dt-action-block` wrapper present in DOM for all project pane states
- Support absent from Personal Projects dropdown; not absent from SPHERE_ACTIONS
- Saved `support` action renders legacy notice without crash
- Empty block shows only action-type dropdown
- No visual regression in existing form sections
- Token discipline: zero bare hex in new CSS
- `specs/stories/sprint-status.yaml` updated: dtui-4 → review

---

## Compliance

- CC4 — Token discipline: CSS uses `:root` tokens only
- CC5 — No new copy added (legacy notice is minimal); British English
- CC9 — `.dt-action-block` is a canonical component (UX-DR5)

---

## Dependencies and Ordering

- **Depends on:** dtui-1 (`.dt-ticker`), dtui-2 (`.dt-chip-grid`), dtui-3 (`.dt-action-desc`) — CSS components must exist first
- **Unblocks:** dtui-5 through dtui-11 (all Wave 2 stories build on the shell)
- **Sequencing:** Land dtui-4 first in Wave 2. All subsequent Wave 2 stories assume the `.dt-action-block` wrapper exists.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

- Added `.dt-action-block { display:flex; flex-direction:column; gap:12px }` CSS after `.dt-action-desc` keyframes block in components.css. No bare hex; uses no `:root` tokens (layout-only rule).
- Removed `{ value: 'support', ... }` entry from `PROJECT_ACTIONS` in downtime-data.js. `SPHERE_ACTIONS` untouched (dtui-15 handles it). `JOINT_ELIGIBLE_ACTIONS` already excluded `support` by comment.
- Removed `'support': ['title', 'pools', 'outcome', 'cast', 'description']` from `ACTION_FIELDS` in downtime-form.js. Legacy submissions with `actionVal === 'support'` will now hit the `|| []` fallback (no fields), plus the new legacy notice.
- Opened `<div class="dt-action-block">` immediately before the action-type select in `renderProjectSlots()`. Closed it immediately before `</div> // proj-pane`. Rote-locked and joint-support-slot paths both use `continue` before the open tag, so they are unaffected.
- Added backward-compat legacy notice (`qf-desc dt-action-legacy-notice`) after the action-type `</div>`, guarded by `if (actionVal === 'support')`.
- AC5 (value preservation) confirmed as pre-existing behaviour — no code change needed.

### File List

- `public/css/components.css`
- `public/js/tabs/downtime-data.js`
- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-4 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-4 implemented: `.dt-action-block` CSS + wrapper, support removed from PROJECT_ACTIONS + ACTION_FIELDS, legacy notice added. |
