---
id: dtsr.4
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: [dtsr.3]
---

# Story DTSR-4: ST inline edit of published narrative sections on historical cycles

As a Storyteller who notices a typo, factual slip, or missing follow-up in a previously-published downtime narrative,
I should be able to click a section in the player Story view and edit it inline (visible only to me, gated to historical cycles where the cycle is closed or complete),
So that I can correct or extend a published narrative without re-opening the entire cycle's processing or running the full publish workflow again — a one-shot, low-friction edit-in-place flow.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). The DT Story tab is the primary authoring surface for the **active** cycle (DTSR-3 enforces this). For **historical** cycles (post-publish, no longer the focus of any phase), STs occasionally need to fix small things — a typo, a wrong NPC name, an after-the-fact line. Today there is no in-place edit path; the ST has to open Mongo or re-run a republish workflow.

DTSR-4 adds a per-section inline edit affordance on the player Story view (`public/js/tabs/story-tab.js`), gated to:
- Viewer is an ST (`isSTRole()`).
- Cycle status is `closed` or `complete` (i.e. not the active cycle — those are still authored via the DT Story tab).

The memory locks the simpler call: **no edit-lock flag, no Re-Push interaction**:

> Inline edit on player Story view, **historical cycles only** (cycle status `closed`/`complete`); no edit-lock flag, no Re-Push interaction

Translation:
- "No edit-lock flag" — there is no boolean field on the cycle or submission that says "this is editable now". The gate is purely status-based.
- "No Re-Push interaction" — saving the edit does not run the publish workflow again, does not bump `published_at`, does not surface a "narrative updated" notification on the player side. The player sees the new text on next page load. Quiet edit by design.

The edit unit is **per section** (Story Moment, Home Report, Feeding, individual Project response, individual Merit response, individual Rumour). The structured `st_narrative.<key>.response` field is the source of truth; on save, the edit re-runs `compilePushOutcome(sub)` and writes the assembled blob to `st_review.outcome_text` (which is what the player view reads via the `published_outcome` fallback at `story-tab.js:30-34`).

### Files in scope

- `public/js/tabs/story-tab.js` — primary surface:
  - `renderChronicle` (line 124) — pass cycle status into per-entry render so the gate can be evaluated.
  - `renderOutcomeWithCards` (line 213) — wrap each section/card with an Edit affordance when the gate is open; render the textarea / Save / Cancel UI in place.
  - The existing parse logic (`parseOutcomeSections`) is the read path; the edit path goes through `st_narrative.<key>.response` writes plus a re-compile.
- `public/js/admin/downtime-story.js` — export `compilePushOutcome` so `story-tab.js` can call it. (Today it's a private helper; this story makes it a module export.)
- `public/js/data/api.js` — no change; existing `apiPut('/api/downtime_submissions/:id', patch)` is the persistence hook.
- The role check: import `isSTRole` from `public/js/auth/discord.js` into `story-tab.js`.

### Out of scope

- Inline editing of the **active** cycle's narratives. Active cycle authoring stays in DT Story tab; the inline-edit affordance does not appear on the player view for active-cycle entries.
- Edit history / audit log. The ST who edits does not get a "this was edited" badge; nothing is timestamped beyond what Mongo's `updated_at` already records. If audit becomes useful, add it as a follow-up.
- Edit conflict resolution. If two STs edit the same section concurrently, last write wins (no optimistic locking). Acceptable at our 3-ST scale.
- Player-side editing. Players never see Edit affordances — only the rendered text.
- Re-publishing or notifications. The edit is silent; no `published_at` bump, no "this narrative was updated" pill, no email.
- Adding new sections that didn't exist when the cycle was published. The ST can edit any **existing** section's text but cannot add a Story Moment to a submission that was published without one. (If they want to add a new section's worth of content, they have to use Mongo or republish.)
- Editing project cards' structured fields (`projects_resolved[i]`). The ST can edit the **narrative response** for each project (the prose), but not the action-type, target, dice rolled, etc. Those structured fields are immutable on historical cycles.
- Editing `general_notes` or any non-section content surfaced in the Chronicle. If `general_notes` is the only authored content, the inline edit affordance does not appear (single textarea covering everything is too coarse).
- Inline edit on the merit summary (DTSR-6 handles content audit; DTSR-5 handles processing-side resolution panel; DTSR-4's per-section edit applies to merit-summary section if present, treating it as one editable block).
- Server-side enforcement of the cycle-status gate. Client-side check is sufficient for now (STs only; trusted role); a follow-up story can add server-side rejection if cycle is `active`/`game`/`prep` and the section update is requested via `st_review.outcome_text`. Not in this story.

---

## Acceptance Criteria

### Visibility gate

**Given** I am authenticated as a player (not ST)
**When** I view my Story tab
**Then** **no Edit affordances appear** anywhere on any chronicle entry, regardless of cycle status.

**Given** I am authenticated as an ST viewing a Chronicle entry
**When** the entry's cycle has `status === 'active'`, `'game'`, `'prep'`, or any non-historical status
**Then** **no Edit affordances appear** on that entry.

**Given** I am authenticated as an ST viewing a Chronicle entry
**When** the entry's cycle has `status === 'closed'` or `status === 'complete'`
**Then** **Edit affordances do appear** on each editable section within that entry.

### Editable sections

**Given** an editable Chronicle entry
**Then** each of the following sections, where present, has an inline Edit button (small pencil icon or "Edit" link, visually subtle, near the section header):
- Story Moment
- Home Report
- Each Project Report card (one Edit per card)
- Each Merit Action / Allies & Asset entry (one Edit per entry)
- Each Rumour line (one Edit per Rumour slot)
- Feeding section (if it has authored narrative — DTSR-7 introduces this; pre-DTSR-7, Feeding has no authored prose so no Edit button)

**Given** I click Edit on a section
**Then** the section's prose is replaced inline by a `<textarea>` pre-filled with the current text, plus a Save button and a Cancel button.
**And** the Save button is disabled if the textarea content is unchanged.

**Given** I click Cancel
**Then** the section reverts to its rendered state (no save, no API call).

**Given** I click Save
**Then** the corresponding `st_narrative.<section_key>.response` (or for indexed sections like project_responses, `st_narrative.project_responses[i].response`) is updated with the new text.
**And** `compilePushOutcome(sub)` is re-run on the updated submission.
**And** the assembled blob is written to `st_review.outcome_text` via PUT `/api/downtime_submissions/:id`.
**And** the section re-renders with the new text in place; the rest of the Chronicle entry is not re-rendered.
**And** there is a brief save-confirmation indicator (toast, small "Saved" badge, or similar).

### Persistence and consistency

**Given** I save an edit
**When** I refresh the page
**Then** the new text persists (it was saved to Mongo).
**And** the player viewing the same entry sees the new text on their next load.
**And** there is **no** new `published_at` timestamp or visibility flip — the edit is silent.

**Given** the section edit fails (network error, server rejection)
**Then** the textarea remains open, the existing text is preserved in the textarea, an error message appears nearby, and the user can retry or cancel.

### Behaviour on the active cycle

**Given** the cycle is the active one (per DTSR-3's resolver, this is the most recent non-`complete` cycle)
**Then** the Chronicle entry **does not** show Edit affordances even for an ST.
**And** the ST is implicitly directed back to the DT Story tab for active-cycle authoring (no copy needed; the absence of Edit is itself a signal).

### Visual

**Given** an Edit affordance is rendered
**Then** it is visually subtle: low-contrast pencil icon or muted "Edit" link near the section heading; does not dominate the chronicle's reading experience.
**And** when active (textarea open), the section's heading retains its style and the textarea uses a familiar admin-form treatment (consistent with existing `dt-story-response-ta` from `downtime-story.js`).

---

## Implementation Notes

### Read path stays the same

`renderChronicle` already filters submissions to those with `published_outcome`, parses sections, and assembles cards. DTSR-4 adds:

1. A `cycleStatus` lookup (passed alongside `cycleLabel` from `cycleMap`).
2. Per-section render hooks that emit an Edit button when `isSTRole() && (cycleStatus === 'closed' || cycleStatus === 'complete')`.

The cleanest pattern: build a `cycleStatusMap` parallel to `cycleMap`:

```js
const cycleStatusMap = {};
for (const c of cycles) cycleStatusMap[String(c._id)] = c.status || '';
```

Pass `cycleStatusMap[String(sub.cycle_id)]` into `renderOutcomeWithCards(sub, { editable })`.

### Edit affordance

Reuse existing classes where possible. New class `.story-section-edit` for the inline pencil/edit link. New class `.story-section-edit-active` applied when the textarea is open.

```html
<div class="story-section">
  <div class="story-section-header">
    <h4 class="story-section-head">Story Moment</h4>
    <button class="story-section-edit" data-sub-id="..." data-section-key="story_moment" data-section-idx="">Edit</button>
  </div>
  <!-- prose paragraphs OR textarea here -->
</div>
```

For indexed sections (`project_responses[i]`, `cacophony_savvy[i]`), the button carries `data-section-idx="i"`. For non-indexed (`story_moment`, `home_report`, `feeding_narrative`), `data-section-idx=""`.

### Save handler

```js
async function handleSectionEditSave(btn) {
  const subId = btn.dataset.subId;
  const sectionKey = btn.dataset.sectionKey;
  const idx = btn.dataset.sectionIdx;
  const textarea = btn.closest('.story-section').querySelector('.story-section-edit-ta');
  const newText = textarea.value;

  // Build the patch for the structured field
  let patch;
  if (idx === '' || idx == null) {
    patch = { [`st_narrative.${sectionKey}.response`]: newText };
  } else {
    // Indexed sections need to write the whole array (or a single index dot-path
    // depending on what the existing API accepts). Verify at implementation.
    patch = { [`st_narrative.${sectionKey}.${idx}.response`]: newText };
  }

  // Apply to local copy of sub
  applyPatchLocally(subId, patch);

  // Re-compile published outcome
  const sub = findSub(subId);
  const md = compilePushOutcome(sub);
  patch['st_review.outcome_text'] = md;
  patch['published_outcome'] = md; // mirror for in-memory rendering

  await apiPut(`/api/downtime_submissions/${subId}`, patch);
  rerenderSection(btn);
}
```

The dot-path patch shape (`st_narrative.project_responses.0.response`) needs verification against the existing `apiPut` route — if the backend uses Mongo's dotted-path `$set`, this works directly; if it deep-merges, an array element might require sending the whole array. Verify at implementation.

### compilePushOutcome export

`compilePushOutcome` at `public/js/admin/downtime-story.js:2913` is currently a module-private helper. Make it an exported function so `story-tab.js` can import it. No behaviour change.

### Role gate

```js
import { isSTRole } from '../auth/discord.js';

const editable = isSTRole() && (cycleStatus === 'closed' || cycleStatus === 'complete');
```

Pass `editable` into per-section renders. Each section render checks and emits the Edit button conditionally.

### Strawman wording

- Edit button label: small pencil icon (✎ U+270E) or text "Edit" — pick one and be consistent.
- Save success indicator: brief "Saved" inline next to the button, fading after ~1.5s.
- Cancel button: "Cancel" text button next to Save.
- No confirmation dialog on Save — the edit is small and reversible (the ST can re-edit if they make a typo).

### No tests required

UI affordance with persistence through an existing API. Manual smoke test in browser as ST against a closed cycle, verifying both the visibility gate and the persistence round-trip. Optionally extend `server/tests/api-publish-cycle.test.js` to cover the patch-and-recompile round-trip; not blocking.

---

## Files Expected to Change

- `public/js/tabs/story-tab.js` — Edit affordance, textarea/save/cancel UI, cycleStatusMap pass-through, role gate, save handler that patches `st_narrative.<key>.response` and re-compiles via `compilePushOutcome`.
- `public/js/admin/downtime-story.js` — change `compilePushOutcome` from `function` to `export function` (single-line change).
- (Possibly) `public/css/` — small styles for `.story-section-edit`, `.story-section-edit-ta`, the Saved indicator. Reuse existing tokens.

No server changes; existing PUT route accepts the dotted-path patch shape.

---

## Definition of Done

- All AC verified.
- Manual smoke test as ST:
  - Open Story tab on a character with multiple chronicle entries spanning closed and complete cycles → Edit buttons appear on those entries; verify none appears on the active cycle's entry (if present).
  - Click Edit on a Story Moment, edit the text, save → new text shows in place, refresh shows the same.
  - Edit a Project Report card → narrative response updates, project card structure preserved.
  - Edit a Rumour line → updated text persists.
  - Cancel an edit → textarea closes, no API call made, original text retained.
- Manual smoke test as player (or ST viewing as player via lst-6 toggle):
  - No Edit affordances visible anywhere.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-4-inline-edit-historical-cycles: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on DTSR-3** for the active-vs-historical distinction; without DTSR-3, the active cycle could end up labelled `complete` in some edge cases and become inappropriately editable. DTSR-3's resolver tightening makes the gate consistent.
- Independent of DTSR-1, DTSR-2, DTSR-5+. The Edit affordance reads whatever section structure is current; DTSR-1's reorder and DTSR-2's consolidation flow through the standard `st_narrative` shape.
- Sets up the same affordance pattern that **DTSR-8 (player flag UI)** could optionally reuse — but they are separate stories with different gates (player flag is for any cycle the player can read; ST inline edit is historical only).
