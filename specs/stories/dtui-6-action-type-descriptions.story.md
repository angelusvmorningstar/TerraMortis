---
id: dtui.6
epic: dtui
status: ready-for-dev
priority: high
depends_on: [dtui.4, dtui.3]
---

# Story DTUI-6: Action type descriptions per action

As a player picking an action type,
I want a brief italic description to appear below the dropdown explaining what the action does,
So that I confirm I picked the right thing without hunting for help text.

---

## Context

Wires content into the `.dt-action-desc` component (established in dtui-3). Adds a constant `ACTION_DESCRIPTIONS` to `downtime-data.js` and renders the appropriate description below the action-type dropdown in `renderProjectSlots()`.

The `.dt-action-desc` element with `aria-live="polite"` is the display shell. This story populates it with per-action copy. The Allies action descriptions (dtui-15) use the same copy for matching actions.

The `.dt-action-block` wrapper from dtui-4 must be present. The description element renders as zone 2 in the fixed flow (immediately below the action-type dropdown).

### Per-action copy (from `specs/ux-design-downtime-form.md`)

| Action | Copy |
|---|---|
| `ambience_increase` | *"This project will apply your successes directly towards improving the ambience of the selected territory."* |
| `ambience_decrease` | *"This project will apply your successes directly towards degrading the ambience of the selected territory."* |
| `attack` | *"You are attempting to destroy, ruin, or harm a specific target. You will need to select a character you're targeting, and detail to us the specific thing attached to them you're trying to affect — a merit, a holding, a project, or an NPC — and describe how you're going about harming that thing."* |
| `hide_protect` | *"You are attempting to secure a specific target from harm or discovery this downtime. You will need to select what you are protecting — this can be a merit, a holding, a project, or a person — and describe how you are securing it."* |
| `investigate` | *"You are attempting to find out secrets about this target. You will need a lead or some starting point for your investigation — you can't investigate someone out of thin air. Describe what it is that you're investigating and what your lead is."* |
| `patrol_scout` | *"You are actively observing the activity of the chosen territory. Describe how your character goes about observing — who they talk to, where they watch from, how long they spend."* |
| `xp_spend` | *"You are spending experience to grow your character. Select the trait below."* |
| `misc` | *"This is for downtime actions that don't neatly fit into any other category. Describe what you're attempting to achieve and how your character goes about it."* |
| `maintenance` | *"You are maintaining your professional or cult relationships. Select the asset you are maintaining below."* |

Note: `support` is removed by dtui-4 — no description entry needed for it.

---

## Files in scope

- `public/js/tabs/downtime-data.js` — add `ACTION_DESCRIPTIONS` constant and export it
- `public/js/tabs/downtime-form.js` — import `ACTION_DESCRIPTIONS`; render `.dt-action-desc` element after the action-type `<select>` in `renderProjectSlots()`

---

## Out of scope

- Allies action descriptions — dtui-15
- The `.dt-action-desc` CSS (already exists from dtui-3)
- `ambience_change` consolidated action — dtui-10 replaces `ambience_increase`/`ambience_decrease` entries with a single one

---

## Acceptance Criteria

### AC1 — Description appears when action selected

**Given** a player selects "Attack" from the action-type dropdown,
**When** the block re-renders,
**Then** a `.dt-action-desc` element with `aria-live="polite"` appears immediately below the dropdown showing: *"You are attempting to destroy, ruin, or harm a specific target..."* (full copy per table above).

### AC2 — Description hidden when no action selected

**Given** a project slot has no action selected,
**When** the pane renders,
**Then** the `.dt-action-desc` element is either absent from the DOM, or rendered empty (collapses via `:empty { display: none }` per dtui-3 CSS).

### AC3 — Description updates on action change

**Given** a player changes from "Investigate" to "Patrol/Scout",
**When** the new action is set,
**Then** the `.dt-action-desc` shows the Patrol/Scout copy. The previous Investigate copy is gone.

### AC4 — All nine action types have descriptions

**Given** a player cycles through all available action types,
**When** each is selected,
**Then** each shows a non-empty description. The nine covered actions are: ambience_increase, ambience_decrease, attack, hide_protect, investigate, patrol_scout, xp_spend, misc, maintenance.

### AC5 — British English, no em-dashes

**Given** the description copy is rendered,
**When** a developer reads the text content,
**Then** all copy uses British English spelling and contains no em-dashes (use commas or full stops instead).

---

## Implementation Notes

### New constant in downtime-data.js

Add after the `PROJECT_ACTIONS` export (around line 22):

```javascript
export const ACTION_DESCRIPTIONS = {
  'ambience_increase': 'This project will apply your successes directly towards improving the ambience of the selected territory.',
  'ambience_decrease': 'This project will apply your successes directly towards degrading the ambience of the selected territory.',
  'attack': 'You are attempting to destroy, ruin, or harm a specific target. You will need to select a character you\'re targeting, and detail to us the specific thing attached to them you\'re trying to affect — a merit, a holding, a project, or an NPC — and describe how you\'re going about harming that thing.',
  'hide_protect': 'You are attempting to secure a specific target from harm or discovery this downtime. You will need to select what you are protecting — this can be a merit, a holding, a project, or a person — and describe how you are securing it.',
  'investigate': 'You are attempting to find out secrets about this target. You will need a lead or some starting point for your investigation — you can\'t investigate someone out of thin air. Describe what it is that you\'re investigating and what your lead is.',
  'patrol_scout': 'You are actively observing the activity of the chosen territory. Describe how your character goes about observing — who they talk to, where they watch from, how long they spend.',
  'xp_spend': 'You are spending experience to grow your character. Select the trait below.',
  'misc': 'This is for downtime actions that don\'t neatly fit into any other category. Describe what you\'re attempting to achieve and how your character goes about it.',
  'maintenance': 'You are maintaining your professional or cult relationships. Select the asset you are maintaining below.',
};
```

Note: When dtui-10 ships (Ambience Change consolidation), `ambience_increase` and `ambience_decrease` entries are replaced with a single `ambience_change` entry. For now, both entries are needed.

### Render in downtime-form.js

Import `ACTION_DESCRIPTIONS` at the top of the file alongside other imports from `downtime-data.js` (line 16).

In `renderProjectSlots()`, immediately after the action-type `<select>` closing `</div>` (after line 2805), add:

```javascript
// .dt-action-desc �� descriptive copy; aria-live="polite" for screen reader announce
const actionDesc = ACTION_DESCRIPTIONS[actionVal] || '';
h += `<p class="dt-action-desc" aria-live="polite">${esc(actionDesc)}</p>`;
```

When `actionVal` is empty, `actionDesc` is `''`, so the `:empty` CSS rule collapses the element automatically (dtui-3 CSS).

The `esc()` function (existing HTML-escape helper in the file) sanitises the description copy before rendering. Since the copy is developer-controlled constants, escaping is precautionary but correct.

---

## Files Expected to Change

- `public/js/tabs/downtime-data.js` — add `ACTION_DESCRIPTIONS` constant (~12 lines) and export
- `public/js/tabs/downtime-form.js` — add import; add 3-line `.dt-action-desc` render after action-type select

---

## Definition of Done

- AC1–AC5 verified
- All 9 action types show correct descriptions
- Empty action hides description
- Action change shows new description (fade-in via dtui-3 CSS keyframe)
- British English + no em-dashes in all copy
- `specs/stories/sprint-status.yaml` updated: dtui-6 → review

---

## Compliance

- CC5 — British English, no em-dashes: all description copy verified
- CC9 — Uses `.dt-action-desc` canonical component (dtui-3)

---

## Dependencies and Ordering

- **Depends on:** dtui-3 (`.dt-action-desc` CSS), dtui-4 (`.dt-action-block` wrapper)
- **Unblocks:** dtui-15 (Allies descriptions reuse `ACTION_DESCRIPTIONS`)
- Can be implemented concurrently with dtui-5, dtui-7, dtui-8, dtui-9 once dtui-4 is in

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
| 2026-04-29 | DTUI-6 story drafted; ready-for-dev. |
