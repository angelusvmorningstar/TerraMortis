---
id: dtui.12
epic: dtui
status: review
priority: high
depends_on: [dtui.5, dtui.2]
---

# Story DTUI-12: `.dt-joint-panel` auto-expand + stacked chip grids

As a player who wants help on an action,
I want the Joint panel to expand automatically beneath the action block when I tick "Joint", showing two stacked chip grids — one for player invitees, one for my own sphere merits,
So that I can choose whether to bring players, merits, or both, in one clear panel.

---

## Context

The Solo/Joint ticker was moved to the bottom of the action block in dtui-5 (line ~2994). When the player selects Joint, `renderJointAuthoring(n, saved, existingJoint)` is currently called (line 3006) and renders a `div.dt-joint-authoring` containing: joint description textarea, joint target picker, invitee grid, and (if existingJoint) status badges, re-invite panel, cancel panel.

This story restructures the **non-`existingJoint` authoring path** (i.e. when the joint does not yet exist in the DB — the player is composing a new joint action). The structure changes to a proper `.dt-joint-panel` container holding two clearly-labelled chip grids stacked vertically:

1. **Players** — player invitees (multi-select chip grid, implemented in dtui-13)
2. **Your Allies and Retainers** — sphere-merit collaborators (multi-select chip grid, implemented in dtui-14)

The existing JDT joint lifecycle elements (joint description textarea, target picker, status badges, re-invite, cancel) belong to the JDT epic and must **not** be disturbed. The refactor adds the chip-grid containers inside the non-existingJoint branch and wraps them in a `.dt-joint-panel` div with proper `aria-expanded` semantics.

The `existingJoint` branch (when a joint document already exists in the cycle) is JDT scope — leave it unchanged.

**Key code locations:**
- `renderJointAuthoring()` — `downtime-form.js` line ~4045–4142
- `renderJointInviteeGrid()` — `downtime-form.js` line ~4196–4210 (currently renders `dt-joint-invitee-grid` with `<label><input type="checkbox">` items — dtui-13 will convert these to `.dt-chip`)
- Solo/Joint ticker change handler — search for `data-project-solo-joint` in the event delegation block (the re-render is triggered on radio change, which causes a full `renderProjectSlots()` call)
- `dt-joint-authoring` CSS class in `public/css/downtime-form.css` — will need a companion `.dt-joint-panel` rule

---

## Files in scope

- `public/js/tabs/downtime-form.js` — refactor the non-existingJoint path in `renderJointAuthoring()` to use `.dt-joint-panel` wrapper; add chip-grid skeleton placeholders for Players and Sphere merits; set `aria-expanded`
- `public/css/downtime-form.css` — add `.dt-joint-panel`, `.dt-joint-panel__section`, `.dt-joint-panel__heading` rules; transition for expand/collapse (skipped under `prefers-reduced-motion`)

---

## Out of scope

- Player invitee chip contents / greying logic (dtui-13)
- Sphere-merit chip contents / auto-commit (dtui-14)
- Joint description textarea, target picker, status badges, re-invite, cancel — JDT scope, untouched
- The `existingJoint` branch of `renderJointAuthoring()` — untouched

---

## Acceptance Criteria

### AC1 — Panel hidden when Solo is selected

**Given** a player has Solo/Joint set to Solo (or action block just rendered),
**When** the action block renders,
**Then** no `.dt-joint-panel` element is visible (either absent from DOM or `aria-expanded="false"` and CSS-hidden).

### AC2 — Panel auto-expands when Joint is ticked

**Given** a player toggles the Solo/Joint ticker to Joint,
**When** the ticker change triggers a re-render,
**Then** the `.dt-joint-panel` renders expanded beneath the action block (transition respects `prefers-reduced-motion`).

### AC3 — Panel contains two labelled sections

**Given** the Joint panel is open and `existingJoint` is null (new joint),
**When** the panel renders,
**Then** two sections appear stacked vertically: first section labelled "Players", second section labelled "Your Allies and Retainers". Each section contains a placeholder `.dt-chip-grid` (populated in dtui-13 and dtui-14 respectively).

### AC4 — `aria-expanded` tracks panel state

**Given** a screen reader is on the form,
**When** the Joint panel state changes,
**Then** the closest containing block element has `aria-expanded="true"` when the panel is open and `aria-expanded="false"` when closed.

### AC5 — Each chip-grid has its own `aria-labelledby`

**Given** the Joint panel is open,
**When** it is examined for accessibility,
**Then** each `.dt-chip-grid` has an `aria-labelledby` attribute pointing to the `id` of its visible section heading.

### AC6 — existingJoint branch unchanged

**Given** a joint document already exists on the cycle for this slot,
**When** the panel renders,
**Then** the existing JDT content (status badges, re-invite, cancel) renders as before — no regression.

---

## Implementation Notes

### Refactor plan for `renderJointAuthoring()`

Split the function into two paths:

```javascript
function renderJointAuthoring(n, saved, existingJoint) {
  // Existing JDT path — unchanged
  if (existingJoint) {
    return renderJointExistingPanel(n, saved, existingJoint);
  }
  // DTUI-12: new authoring path
  return renderDtJointPanel(n, saved);
}
```

Extract the existing non-`existingJoint` content into the `existingJoint` branch helper or inline. Then implement:

```javascript
function renderDtJointPanel(n, saved) {
  let h = `<div class="dt-joint-panel" aria-expanded="true" data-joint-slot="${n}">`;

  // Section 1: Player invitees
  const playersHeadingId = `dt-joint-players-heading-${n}`;
  h += `<div class="dt-joint-panel__section">`;
  h += `<h4 class="dt-joint-panel__heading" id="${playersHeadingId}">Players</h4>`;
  // dtui-13 will populate this chip grid
  h += `<div class="dt-chip-grid dt-chip-grid--multi" aria-labelledby="${playersHeadingId}" data-joint-players="${n}">`;
  h += renderJointInviteeChips(n, saved); // implemented in dtui-13; returns '' placeholder for now
  h += `</div>`;
  h += `</div>`;

  // Section 2: Sphere-merit collaborators
  const meritsHeadingId = `dt-joint-merits-heading-${n}`;
  h += `<div class="dt-joint-panel__section">`;
  h += `<h4 class="dt-joint-panel__heading" id="${meritsHeadingId}">Your Allies and Retainers</h4>`;
  // dtui-14 will populate this chip grid
  h += `<div class="dt-chip-grid dt-chip-grid--multi" aria-labelledby="${meritsHeadingId}" data-joint-merits="${n}">`;
  h += renderJointSphereChips(n, saved); // implemented in dtui-14; returns '' placeholder for now
  h += `</div>`;
  h += `</div>`;

  h += `</div>`; // dt-joint-panel
  return h;
}
```

For this story, `renderJointInviteeChips()` and `renderJointSphereChips()` are stub functions that return `''` — their implementations are dtui-13 and dtui-14.

### CSS additions

```css
.dt-joint-panel {
  margin-top: var(--space-3, 12px);
  border: 1px solid var(--surf2);
  border-radius: 4px;
  padding: var(--space-3, 12px);
  background: var(--surf1);
}

.dt-joint-panel__section + .dt-joint-panel__section {
  margin-top: var(--space-4, 16px);
  padding-top: var(--space-4, 16px);
  border-top: 1px solid var(--surf2);
}

.dt-joint-panel__heading {
  font-family: var(--font-heading, 'Cinzel', serif);
  font-size: 0.85rem;
  color: var(--gold3);
  margin: 0 0 var(--space-2, 8px) 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

@media (prefers-reduced-motion: no-preference) {
  .dt-joint-panel {
    animation: dt-panel-fadein 200ms ease-out;
  }
  @keyframes dt-panel-fadein {
    from { opacity: 0; transform: translateY(-4px); }
    to   { opacity: 1; transform: translateY(0); }
  }
}
```

### Preserving JDT content

Move the existing non-`existingJoint` inner HTML (description textarea, target picker, invitee grid) into a separate function `renderJointExistingPanel()` called only from the `existingJoint` branch. This preserves all JDT behaviour without change.

Alternatively, keep `renderJointAuthoring()` as-is for the `existingJoint` branch and only add the new `renderDtJointPanel()` for the non-existingJoint path. Either approach is fine — choose whichever produces less churn.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — refactor `renderJointAuthoring()`; add `renderDtJointPanel()`; add `renderJointInviteeChips()` and `renderJointSphereChips()` stubs
- `public/css/downtime-form.css` — add `.dt-joint-panel`, `.dt-joint-panel__section`, `.dt-joint-panel__heading` rules

---

## Definition of Done

- AC1–AC6 verified
- Panel hidden in Solo mode; auto-expands in Joint mode
- Two labelled chip-grid sections render when Joint selected (contents empty, populated by dtui-13/14)
- `aria-expanded` and `aria-labelledby` wired correctly
- existingJoint branch renders identically to before (no regression in JDT joint lifecycle)
- `specs/stories/sprint-status.yaml` updated: dtui-12 → review

---

## Compliance

- CC4 — Token discipline: all colours via CSS custom properties; no bare hex
- CC6 — Accessibility: `aria-expanded`, `aria-labelledby`, keyboard navigable panel
- CC7 — Reduced motion: fade-in animation wrapped in `@media (prefers-reduced-motion: no-preference)`
- CC9 — Uses `.dt-chip-grid` canonical component (dtui-2); `.dt-joint-panel` is new compound wrapper

---

## Dependencies and Ordering

- **Depends on:** dtui-5 (Solo/Joint ticker at bottom of action block), dtui-2 (`.dt-chip-grid` component)
- **Unblocks:** dtui-13 (player invitee chip grid), dtui-14 (sphere-merit chip grid + auto-commit)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`renderJointAuthoring()` split: non-existingJoint path early-returns `renderDtJointPanel(n, saved)`; existingJoint path retains full JDT lifecycle content (banner, explainer, description textarea, target read-only, status badges, reinvite, cancel). Dead variables (invitedIds, invitedSet) removed from existingJoint path. `renderJointInviteeChips()` and `renderJointSphereChips()` added as empty stubs for dtui-13 and dtui-14. CSS added to `components.css` with fade-in animation under `prefers-reduced-motion: no-preference` guard.

### File List

- `public/js/tabs/downtime-form.js`
- `public/css/components.css`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-12 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-12 implemented; status → review. |
