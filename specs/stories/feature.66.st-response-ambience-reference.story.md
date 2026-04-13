# Story feature.66: ST Response — Ambience Action Reference Design

## Status: review

## Story

**As an** ST processing a downtime cycle,
**I want** to draft and review a narrative response for each Ambience action,
**so that** there is a clear, sighted write-up per action ready to deliver to the player when the cycle is pushed.

## Background

The processing panel currently has two text fields per action: Player Feedback (visible to player, mechanical/advisory) and ST Notes (internal only). There is no field for the narrative response — the actual story outcome the player receives.

This story adds the ST Response field to Ambience actions (ambience_increase and ambience_decrease) as the reference design. All other action types will replicate this pattern in subsequent stories.

### Placement

**Left panel** — a new ST Response section is inserted above the existing Player Feedback section. It contains:
- A multiline textarea for the narrative
- A save button
- A "Copy context" button that generates a ready-to-paste Claude prompt
- An author label that appears once a draft is saved

**Right panel** — a Review section appears below the Roll card. One ST drafts; a second ST marks it reviewed here once satisfied.

### Response status lifecycle

`response_status` has two values:
- `'draft'` — set automatically when the response is first saved
- `'reviewed'` — set when a second ST clicks the Review button

The author and reviewer names are captured from `getUser()` at the time of each action.

### Copy context prompt

The Copy context button assembles a structured prompt for pasting into Claude.ai. The prompt includes:

- Character name
- Action type (Ambience Increase / Ambience Decrease)
- Territory
- Title, Desired Outcome, Description
- Merits & Bonuses
- Validated pool expression (or player-submitted pool if not yet validated)
- Roll result: dice string, successes, exceptional flag
- House style rules: second person, present tense, British English, no mechanical terms (no discipline names, dot ratings, or success counts in narrative), no em dashes, no editorialising, never dictate what the character felt or chose, 2–4 paragraphs

### Storage

New fields on `projects_resolved[N]`:

| Field | Type | Description |
|-------|------|-------------|
| `st_response` | string | The narrative text |
| `response_author` | string | Display name of ST who drafted it |
| `response_status` | `'draft'\|'reviewed'` | Current status |
| `response_reviewed_by` | string | Display name of ST who reviewed it |

Saved via the existing `saveEntryReview` path (apiPut patch to `projects_resolved`).

---

## Acceptance Criteria

1. For entries where `actionType === 'ambience_increase'` or `'ambience_decrease'`, an **ST Response** section is rendered above Player Feedback in the left panel.
2. The section contains a multiline textarea (min 4 rows) and a **Save** button.
3. On save: `st_response` stored to `projects_resolved[N]`, `response_author` set to `getUser().display_name` (or username fallback), `response_status` set to `'draft'` if not already `'reviewed'`.
4. When a response is saved, a label appears below the textarea: `Drafted by [name]`.
5. A **Copy context** button sits in the ST Response section header row (right-aligned, alongside the "ST RESPONSE" label).
6. Clicking Copy context assembles the structured Claude prompt (see Background) and writes it to the clipboard. The button label briefly changes to `Copied!` then reverts.
7. A **Review** section appears below the Roll card in the right panel, but only when `st_response` is non-empty.
8. The Review section contains a single **Mark reviewed** button.
9. On click: `response_status` saved as `'reviewed'`, `response_reviewed_by` saved as current ST name. The button is replaced by a gold-tinted `Reviewed by [name]` label (non-interactive).
10. On panel re-open, the textarea is pre-filled with `st_response`, the author label reflects `response_author`, and the reviewed state is restored correctly.
11. If `response_status === 'reviewed'`, the textarea and Save button remain editable (a reviewed response can still be amended), but the reviewed-by label persists. Re-saving resets `response_status` to `'draft'` and clears `response_reviewed_by`.
12. Entries where `actionType` is neither `ambience_increase` nor `ambience_decrease` are unaffected by this story.

---

## Tasks / Subtasks

- [x] Task 1: Storage wiring — confirm `projects_resolved` schema accepts new fields (AC: 3, 9)
  - [x] Check `downtime_submission.schema.js` for `projects_resolved` field definition
  - [x] Confirmed `additionalProperties: true` on `resolvedAction` definition — no schema changes needed

- [x] Task 2: ST Response section in left panel (AC: 1, 2, 3, 4)
  - [x] In `renderActionPanel`, before the Player Feedback block, add a guard: `if (entry.source === 'project' && (entry.actionType === 'ambience_increase' || entry.actionType === 'ambience_decrease'))`
  - [x] Render: section header row with `ST RESPONSE` label + Copy context button; textarea with `proc-st-response-textarea`; Save button `proc-st-response-save`
  - [x] Populate textarea from `rev.st_response || ''`
  - [x] Render `Drafted by [name]` label if `rev.response_author` is present

- [x] Task 3: Save handler for ST Response (AC: 3, 11)
  - [x] Wire `proc-st-response-save`: read textarea value, preserve existing author, always set `response_status: 'draft'`, clear `response_reviewed_by: null`
  - [x] Also wired `click` stopPropagation on textarea to prevent row collapse
  - [x] Re-renders after save

- [x] Task 4: Copy context button (AC: 5, 6)
  - [x] Wire `proc-st-response-copy`: assembles full prompt from entry fields + roll result + style rules
  - [x] `navigator.clipboard.writeText(prompt)` then `Copied!` for 1500ms; `Failed` on error
  - [x] Roll result from `getEntryReview(entry).roll`; omitted if no roll yet

- [x] Task 5: Review button in right panel (AC: 7, 8, 9, 10)
  - [x] In `_renderProjRightPanel`, after Roll card, guard by `actionType`
  - [x] `Mark reviewed` button shown when `st_response` non-empty and not yet reviewed
  - [x] `Reviewed by [name]` gold label shown when `response_status === 'reviewed'`
  - [x] Handler saves `response_status: 'reviewed'` + `response_reviewed_by` then re-renders

- [x] Task 6: CSS (AC: 4, 9)
  - [x] `.proc-st-response-section/header/textarea/footer/author` added
  - [x] `.proc-response-status-badge`, `.proc-response-status-draft`, `.proc-response-status-reviewed`
  - [x] `.proc-response-review-section`, `.proc-response-reviewed-label`

---

## Dev Notes

### Where to insert in `renderActionPanel`

The Player Feedback block starts at the line:
```js
// Player feedback
h += '<div style="margin-bottom:12px">';
h += '<div class="proc-detail-label" style="margin-bottom:6px">Player Feedback</div>';
```
Insert the ST Response section immediately before this block, guarded by `entry.actionType`.

### Where to insert in `_renderProjRightPanel`

The Roll card closes with:
```js
h += `</div>`; // proc-proj-roll-card
h += `</div>`; // proc-feed-right
return h;
```
Insert the Review section between the two closing divs, guarded by `entry.actionType`.

### `getUser()` location

`getUser()` is defined in `admin.js`. Confirm it is imported or accessible in `downtime-views.js`. If not, pass the current user as a parameter or read from a module-level variable.

### Copy context prompt template

```
You are helping a Storyteller draft a narrative response for a Vampire: The Requiem 2nd Edition LARP downtime action.

Character: {charName}
Action: {Ambience Increase / Ambience Decrease}
Territory: {projTerritory}
Title: {projTitle}
Desired Outcome: {projOutcome}
Description: {projDescription}
Merits & Bonuses: {projMerits}
Validated Pool: {poolValidated or poolPlayer}
Roll Result: {successes} success{es}{, Exceptional} — Dice: {diceString}

Write a narrative response (2–4 paragraphs) describing what happened during this action from the Storyteller's perspective.

Style rules:
- Second person, present tense
- British English
- No mechanical terms — no discipline names, dot ratings, or success counts in narrative
- No em dashes
- Do not editorialise about what the result means mechanically
- Never dictate what the character felt or chose
```

If the roll has not yet been made, omit the Roll Result line from the prompt.

### Re-save resets reviewed status

AC 11: if a response is re-saved after being reviewed, `response_status` reverts to `'draft'` and `response_reviewed_by` is set to `null`. The reviewing ST will need to re-mark it. This prevents a reviewed stamp from persisting over an amended draft.

### Schema check

Look at the server schema for `downtime_submission`. The `projects_resolved` array entries likely have a defined object shape — check whether `additionalProperties: false` applies. If so, add the four new fields explicitly.

### Key files

| File | Change |
|------|--------|
| `public/js/admin/downtime-views.js` | ST Response section, Review button, Copy context, click handlers |
| `public/css/admin-layout.css` | New CSS classes |
| `server/schemas/downtime_submission.schema.js` | Add new fields to `projects_resolved` entries if needed |

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-13 | 1.0 | Initial draft | Angelus + Claude (SM) |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log References
None — `resolvedAction` schema has `additionalProperties: true`; no schema changes needed. `getUser()` already imported in `downtime-views.js`. `_formatDiceString()` in same file scope.

### Completion Notes List
- ST Response section inserted above Player Feedback, guarded by `ambience_increase || ambience_decrease`
- `response_author` preserved on re-save (not overwritten); only first drafter recorded
- Re-save always resets status to `'draft'` and clears `response_reviewed_by` (AC 11)
- Copy context prompt omits Roll Result line if no roll yet recorded
- Textarea gets `click` stopPropagation to prevent row collapse
- Review section only renders in right panel when `st_response` is non-empty (AC 10)

### File List
- `public/js/admin/downtime-views.js`
- `public/css/admin-layout.css`
