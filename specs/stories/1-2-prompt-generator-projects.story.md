# Story 1.2: Prompt Generator — Projects

## Status: ready-for-dev

## Story

**As an** ST drafting a narrative response for a project action,
**I want** a Copy Context button that assembles a tailored prompt capturing the project's roll result, desired outcome, and house style rules,
**so that** I can paste directly into Claude without manually gathering context.

## Background

Story B1 built the DT Story tab shell with section scaffold placeholders. This story implements the Project Reports section: up to 4 project response cards, each with a Copy Context button, response textarea, Save Draft, and Mark Complete.

The DT Processing tab already has a copy-context implementation for ambience actions (feature.66, `downtime-views.js` lines 3713–3831). This story does NOT touch that code. It builds a parallel implementation inside `downtime-story.js` that reads data from the submission document directly, not from the processing queue entry objects.

### Data source

In `downtime-story.js`, project data is read from the submission document (`_currentSub`):
- **Form responses:** `sub.responses` — contains `project_{slot}_title`, `project_{slot}_outcome`, `project_{slot}_description`, `project_{slot}_territory`, `project_{slot}_cast`, `project_{slot}_merits` (slot is 1-indexed)
- **Resolved data:** `sub.projects_resolved[N]` — contains `pool_validated`, `pool_player`, `pool_status`, `roll`, `notes_thread`, `action_type`
- **st_narrative:** `sub.st_narrative.project_responses[N]` — saved ST response

The index N in `projects_resolved` corresponds to slot N+1 in responses (0-indexed array, 1-indexed slot keys).

### Prompt structure

The `buildProjectContext` function mirrors the feature.66 prompt (lines 3791–3819 of downtime-views.js) but is a standalone pure function with no dependency on downtime-views.js:

```
You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.

Character: {displayName(char)}
Action: {ACTION_TYPE_LABELS[actionType]}
Territory: {territory}
Title: {title}
Desired Outcome: {outcome}
Description: {description}
Characters Involved: {cast}
Merits & Bonuses: {merits}
Validated Pool: {pool_validated || pool_player || '—'}
Roll Result: {successes} success{es}{, Exceptional} — Dice: {dice_string}

[ST Notes:]
- {note.author_name}: {note.text}
...

Write a narrative response (2–4 paragraphs) describing what happened during this action from the Storyteller's perspective.

Style rules:
- Second person, present tense
- British English
- No mechanical terms — no discipline names, dot ratings, or success counts in narrative
- No em dashes
- Do not editorialise about what the result means mechanically
- Never dictate what the character felt or chose
- Target length: ~100 words
```

Omit the Roll Result line if `rev.roll` is null/undefined. Omit the ST Notes block if `rev.notes_thread` is empty. Omit cast/merits/territory lines if their values are empty.

### Action type labels

`ACTION_TYPE_LABELS` is duplicated into `downtime-story.js` (not imported from downtime-views.js per NFR-DS-01):

```js
const ACTION_TYPE_LABELS = {
  ambience_increase: 'Ambience Increase',
  ambience_decrease: 'Ambience Decrease',
  attack: 'Attack',
  hide_protect: 'Hide / Protect',
  investigate: 'Investigate',
  patrol_scout: 'Patrol / Scout',
  support: 'Support',
  misc: 'Miscellaneous',
  maintenance: 'Maintenance',
  xp_spend: 'XP Spend',
  block: 'Block',
  rumour: 'Rumour',
  grow: 'Grow',
  acquisition: 'Acquisition',
};
```

### copyToClipboard utility

Shared utility added to `downtime-story.js`:

```js
function copyToClipboard(text, btnEl) {
  const original = btnEl.textContent;
  navigator.clipboard.writeText(text).then(() => {
    btnEl.textContent = 'Copied!';
    setTimeout(() => { btnEl.textContent = original; }, 1500);
  }).catch(() => {
    btnEl.textContent = 'Failed';
    setTimeout(() => { btnEl.textContent = original; }, 1500);
  });
}
```

### Section card layout

Each project response card:

```
┌─────────────────────────────────────────────────────┐
│ [Action Type chip]  Project Title         [Copy Context] │
│ Desired outcome: ...                                  │
│ Pool: ... | Roll: N successes (Exceptional)           │
│ ─────────────────────────────────────────────────────│
│ [ST Notes, if any — read only]                       │
│ ─────────────────────────────────────────────────────│
│ [textarea — response]                                 │
│ [Save Draft]  [Mark Complete ✓]                       │
└─────────────────────────────────────────────────────┘
```

Context block (collapsible) is shown above the Copy Context button, collapsed once textarea has content.

### Save pattern

Uses `saveNarrativeField` from B1:

```js
// Patch a specific project response by index
await saveNarrativeField(sub._id, {
  [`st_narrative.project_responses`]: buildUpdatedProjectResponses(sub, idx, { response: text, author, status: 'draft' })
});
```

Since MongoDB `$set` with a top-level key replaces the entire array, the full updated array must be passed. Helper:

```js
function buildUpdatedProjectResponses(sub, idx, patch) {
  const arr = [...(sub.st_narrative?.project_responses || [])];
  while (arr.length <= idx) arr.push(null);
  arr[idx] = { ...(arr[idx] || {}), project_index: idx, ...patch };
  return arr;
}
```

Same pattern applies for `action_responses` (used by B3).

### No Roll Needed actions

If `rev.pool_status === 'no_roll'`, render Copy Context button but omit Roll Result line from prompt. The textarea and save/complete pattern remain the same.

### Skipped actions

If `rev.pool_status === 'skipped'`, do not render the card at all. Skipped actions do not generate narrative output.

### getUser() location

`getUser()` is exported from `public/js/auth/discord.js`. Import it:
```js
import { getUser } from '../auth/discord.js';
```
Returns `{ username, global_name, role, ... }`. Use `user.global_name || user.username || 'ST'` as the author name.

---

## Acceptance Criteria

1. The Project Reports section in DT Story renders up to 4 cards, one per entry in `sub.projects_resolved` (0-indexed). Cards for skipped actions (`pool_status === 'skipped'`) are not rendered.
2. Each card shows: action type chip (human-readable label from ACTION_TYPE_LABELS), project title, desired outcome, pool expression, roll result summary (successes + exceptional flag) if a roll exists.
3. ST notes from `rev.notes_thread` are displayed read-only above the textarea if non-empty.
4. Each card has a **Copy Context** button. Clicking it assembles `buildProjectContext(char, sub, idx)` and writes it to the clipboard. Button shows "Copied!" for 1500ms then reverts. Shows "Failed" on clipboard error.
5. The Copy Context prompt includes: character name, action type label, territory, title, desired outcome, description, cast (if non-empty), merits/bonuses (if non-empty), validated pool (pool_validated preferred, pool_player fallback, '—' if neither), roll result section (omitted if no roll), ST notes (omitted if empty), house style rules.
6. Each card has a textarea pre-filled from `sub.st_narrative?.project_responses[idx]?.response || ''`.
7. **Save Draft** button: saves `{ response: text, author: displayName from getUser(), status: 'draft' }` to `st_narrative.project_responses[idx]` via `saveNarrativeField`. Re-renders section after save.
8. **Mark Complete** button: saves `{ ..., status: 'complete' }`. The card's completion dot updates immediately. The pill rail amber/green indicator re-derives from `isSectionComplete`.
9. If the project responses section has all applicable cards marked complete, `isSectionComplete(stNarrative, 'project_responses')` returns true. (Note: adapt the section key — project_responses is an array, so completion means all non-skipped entries have `status === 'complete'`.)
10. The context block collapses to a "Show context" link once the textarea has content.
11. No code is added to `downtime-views.js`. `ACTION_TYPE_LABELS` is duplicated into `downtime-story.js`.
12. `buildProjectContext` is a pure function — no side effects, no DOM access, returns a string.

---

## Tasks / Subtasks

- [ ] Task 1: Duplicate ACTION_TYPE_LABELS into downtime-story.js
  - [ ] Copy the constant from downtime-views.js lines 95–110
  - [ ] Place at top of downtime-story.js after imports

- [ ] Task 2: copyToClipboard(text, btnEl) utility
  - [ ] Implement as described in Background — handles both success and failure states

- [ ] Task 3: buildProjectContext(char, sub, idx) pure function
  - [ ] Reads `sub.responses` for slot (idx+1): title, outcome, description, territory, cast, merits
  - [ ] Reads `sub.projects_resolved[idx]`: pool_validated, pool_player, roll, notes_thread, action_type
  - [ ] Assembles prompt string — omits empty lines (no territory line if territory blank, etc.)
  - [ ] Omits Roll Result block if `rev.roll` is null
  - [ ] Omits ST Notes block if `rev.notes_thread` is empty or absent
  - [ ] Returns assembled string

- [ ] Task 4: buildUpdatedProjectResponses(sub, idx, patch) helper
  - [ ] Merges patch into array at idx — preserves other entries
  - [ ] Handles absent st_narrative.project_responses gracefully (initialises as empty array)

- [ ] Task 5: renderProjectReports(char, sub) renderer
  - [ ] Replaces the B1 scaffold placeholder for the Project Reports section
  - [ ] Iterates sub.projects_resolved (max 4)
  - [ ] Skips entries where pool_status === 'skipped'
  - [ ] Renders each card: action type chip, title, outcome, pool, roll summary, notes thread (read-only), context block, Copy Context button, textarea, Save Draft, Mark Complete
  - [ ] Context block: collapsed if textarea has content; expanded otherwise
  - [ ] Pre-fills textarea from sub.st_narrative?.project_responses[idx]?.response

- [ ] Task 6: projectSectionComplete(sub) helper
  - [ ] Returns true if all non-skipped project entries have status === 'complete' in st_narrative.project_responses
  - [ ] Used by isSectionComplete and the pill rail (adapt isSectionComplete to handle array sections)

- [ ] Task 7: Event delegation for project cards
  - [ ] Copy Context button click → buildProjectContext → copyToClipboard
  - [ ] Context block toggle (Show context / Hide context)
  - [ ] Save Draft button → save with status: 'draft' → re-render
  - [ ] Mark Complete button → save with status: 'complete' → re-render + update pill rail

- [ ] Task 8: CSS for project response cards
  - [ ] `.dt-story-proj-card` — card container
  - [ ] `.dt-story-proj-header` — title row with action chip + copy button
  - [ ] `.dt-story-action-chip` — action type chip (matches existing chip style: 10px, 700, uppercase, 3px border-radius)
  - [ ] `.dt-story-proj-meta` — outcome/pool/roll summary row
  - [ ] `.dt-story-notes-thread` — read-only ST notes display
  - [ ] `.dt-story-context-block` — collapsible context area
  - [ ] `.dt-story-context-toggle` — "Show context" / "Hide context" link
  - [ ] `.dt-story-response-ta` — response textarea (min 4 rows)
  - [ ] `.dt-story-card-actions` — save/complete button row

---

## Dev Notes

### Reading project slot keys from sub.responses

The submission form uses 1-indexed slot keys. Index 0 in projects_resolved → slot 1:

```js
const slot = idx + 1;
const title       = sub.responses?.[`project_${slot}_title`] || '';
const outcome     = sub.responses?.[`project_${slot}_outcome`] || '';
const description = sub.responses?.[`project_${slot}_description`] || '';
const territory   = sub.responses?.[`project_${slot}_territory`] || '';
const cast        = sub.responses?.[`project_${slot}_cast`] || '';
const merits      = sub.responses?.[`project_${slot}_merits`] || '';
```

### Reading the review object

```js
const rev = sub.projects_resolved?.[idx] || {};
const pool = rev.pool_validated || rev.pool_player || '';
const roll = rev.roll || null;
const notes = rev.notes_thread || [];
const actionType = rev.action_type || sub.responses?.[`project_${slot}_action_type`] || '';
```

### Roll result formatting

```js
// roll.successes, roll.exceptional, roll.dice_string
const rollLine = roll
  ? `Roll Result: ${roll.successes} success${roll.successes !== 1 ? 'es' : ''}${roll.exceptional ? ', Exceptional' : ''} — Dice: ${roll.dice_string}`
  : null;
```

No need to call `_formatDiceString` — `dice_string` is already stored in human-readable form (e.g. `[1, 10!, 9!, 4, 5]`).

### isSectionComplete for array sections

The generic `isSectionComplete(stNarrative, key)` checks `stNarrative?.[key]?.status`. Project responses are an array — add a project-specific helper:

```js
function projectResponsesComplete(sub) {
  const resolved = sub.projects_resolved || [];
  const responses = sub.st_narrative?.project_responses || [];
  return resolved
    .filter((_, i) => resolved[i]?.pool_status !== 'skipped')
    .every((_, i) => responses[i]?.status === 'complete');
}
```

Update the pill rail and sign-off counter to call this for the project section rather than the generic `isSectionComplete`.

The same pattern will apply to action_responses in B3 — establish it here so B3 can follow it.

### Context block behaviour

Default state: expanded (context block visible, toggle says "Hide context").
After textarea has content: collapsed (context block hidden, toggle says "Show context").
Detect on render: `if (savedResponse) collapsed = true`.
Toggle via data attribute on section container: `data-context-collapsed="true"`.

### Chip styling note

The action type chip in the card header should match the existing `.proc-*-badge` chip standard already established in admin-layout.css: `font-size: 10px; font-weight: 700; border-radius: 3px; text-transform: uppercase; padding: 2px 6px`. Use `dt-story-action-chip` — do not reuse proc-* classes.

### getUser() author name

```js
const user = getUser();
const author = user?.global_name || user?.username || 'ST';
```

### Key files

| File | Action |
|------|--------|
| `public/js/admin/downtime-story.js` | Modify: add ACTION_TYPE_LABELS, copyToClipboard, buildProjectContext, buildUpdatedProjectResponses, renderProjectReports, projectResponsesComplete, event handlers |
| `public/css/admin-layout.css` | Modify: add project card CSS classes in dt-story-* block |

No other files need to change for this story.

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
- `public/js/admin/downtime-story.js`
- `public/css/admin-layout.css`
