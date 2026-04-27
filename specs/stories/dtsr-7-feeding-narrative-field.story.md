---
id: dtsr.7
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTSR-7: Authored Feeding narrative field on submission

As a Storyteller writing the cycle's narrative,
I should be able to author a paragraph of feeding-scene prose on each player's submission — covering what happened during the feeding that mattered (witnesses, masquerade impact, on-the-night consequences) — and have it published into the player's Feeding section of their report,
So that significant feeding events do not silently disappear once the dice are validated, and players can see the in-world weight of how they fed this cycle alongside the mechanical outcome.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). Today's Feeding section in the DT Story tab (`renderFeedingValidation` at `public/js/admin/downtime-story.js:1086`) shows the validated pool, the roll result, the dice string, and the player's submitted feedback. It has **no authored narrative field**. As a result, a feeding scene that involves a masquerade breach, an observed kill, a witnessed odd act, or any other narratively significant moment leaves DT Processing as numbers only — the player learns the vitae they got, but nothing about consequences or atmosphere.

The memory locks the design call:

> **DTS1.7** — Feeding narrative field on submission (`st_narrative.feeding_narrative`, paragraph-sized, authored in DT Story Feeding Validation section, rendered in player report Feeding section). Closes the masquerade-breach blindspot.

DTSR-7 adds:
1. A textarea (paragraph-sized) in the Feeding Validation section of the DT Story tab.
2. Persistence at `st_narrative.feeding_narrative` (consistent shape with other section fields: `{ response, author, status, revision_note }`).
3. Inclusion of the narrative in `compilePushOutcome` so it appears in the player's published Feeding section.

The strawman field label from memory:

> "What happened during the feeding that mattered — what did others see, what did the player do, what consequences carry forward?"

The narrative is optional — most cycles do not need bespoke feeding prose. The Feeding section's completion logic treats the narrative as additive (completion can be reached without authoring narrative; authoring narrative does not by itself complete the section).

### Files in scope

- `public/js/admin/downtime-story.js`:
  - `renderFeedingValidation` (line 1086): add the narrative textarea + Save / Mark Complete affordances below the existing pool/result/feedback rows.
  - `SECTION_SAVE_HANDLERS['feeding_validation']` (or the equivalent dispatch): handle Save Draft / Mark Complete for the narrative field.
  - `feedingValidationComplete` or the inline completion check at line 1090: stay as today (validated pool OR roll OR no_feed). Narrative is NOT a completion gate.
  - `compilePushOutcome` (line 2913): the existing `if (key === 'feeding_validation') continue;` block needs to change — when `st_narrative.feeding_narrative.response` is populated and complete, include it in the assembled blob under a `## Feeding` heading.

- `server/schemas/downtime_submission.schema.js` — verify `st_narrative.feeding_narrative` is acceptable (likely yes via `additionalProperties: true`).

- DTP epic files (e.g. `specs/epic-dtp-downtime-player-delivery.md`) — coordination note only; the feeding narrative flows through `published_outcome` like other sections, and the v2 player report already has a Feeding section slot for this content.

### Out of scope

- Schema migration of historical submissions — there is no legacy `feeding_narrative` field; pre-DTSR-7 cycles render unchanged (no narrative shown).
- Renaming the section label "Feeding" — unchanged.
- Any change to `feeding_review` (the dice/pool review structure); narrative is a separate field at `st_narrative.feeding_narrative`, not embedded in `feeding_review`.
- Per-territory feeding narratives. Today's territory letter system is being replaced by Territory Pulse (DTIL-4); per-feeding-territory narrative is not part of DTSR-7. The narrative is a single paragraph per submission covering the feeding scene as a whole.
- Auto-population from player feedback. The ST writes the narrative; player feedback is shown in the read-only context block alongside the textarea.
- Player-side UI changes beyond the published outcome rendering — that's the DTP epic's territory.
- Prompt-builder helper for the feeding narrative (no Copy Context button on this section in v1; if it becomes useful, add it as a follow-up).

---

## Acceptance Criteria

### Authoring

**Given** I am an ST viewing the Feeding section of a submission in the DT Story tab
**Then** below the existing pool / result / dice / player feedback rows, I see:
- A field label such as "**Storyteller narrative**" (or simply "Narrative") with a small prompt below it: *"What happened during the feeding that mattered — what did others see, what did the player do, what consequences carry forward?"*
- A `<textarea>` pre-filled with `st_narrative.feeding_narrative.response` (empty if not yet authored).
- A Save Draft button.
- A Mark Complete button (mirrors the same shape as Letter / Touchstone / other section action rows).
- A Needs Revision button (parity with other sections).

**Given** I write narrative text and click Save Draft
**When** the save succeeds
**Then** `st_narrative.feeding_narrative` persists as:
```js
{
  response: '<my text>',
  author: '<my username>',
  status: 'draft',
}
```

**Given** I click Mark Complete
**Then** `status` is set to `'complete'`.

**Given** I click Needs Revision and write a revision note
**Then** `status` is `'needs_revision'` and `revision_note` is the saved string. Same pattern as other sections.

### Completion logic

**Given** a submission has a validated feeding pool but no narrative authored
**Then** the Feeding section's existing completion dot **stays green** (per current logic: `validated || no_feed || roll`).
**And** narrative is treated as **optional** — a missing narrative does not regress completion.

**Given** a submission has a validated feeding pool **and** narrative status `complete`
**Then** the section is complete (same green dot as today).

**Given** a submission's feeding has been validated but narrative is in `draft` or `needs_revision`
**Then** the completion dot remains green (validation is sufficient); the textarea visually indicates its draft/revision state.

(Rationale: most cycles do not need bespoke feeding prose. Forcing completion to require narrative would block ready-to-publish status on cycles where there is genuinely nothing more to say.)

### Read context

**Given** the textarea renders
**Then** the existing context — pool, roll result, dice, player feedback — is rendered above the textarea (not removed). The narrative is additive to the existing data block.

**Given** the player's submitted feedback (`feeding_review.player_feedback`) is non-empty
**Then** it is rendered in its current position (under `<dt>Player Feedback</dt>`) so the ST has the player's prompt as context while writing the narrative.

### Published outcome inclusion

**Given** an ST publishes a submission whose `st_narrative.feeding_narrative.status === 'complete'` and `response` is non-empty
**When** `compilePushOutcome` runs
**Then** the assembled blob includes a section:
```
## Feeding

<the narrative response text>
```

**Given** an ST publishes a submission with no feeding narrative authored (or status not `complete`, or response empty)
**Then** the assembled blob has **no Feeding section** at all (the player's report skips Feeding when there is nothing to say) — the player's report still shows the mechanical Feeding card via the existing DTP delivery surface; only the prose is gated on author state.

**Given** the player Story view (Chronicle pane in `story-tab.js`)
**When** it parses the published outcome
**Then** the Feeding section heading is recognised by the existing `parseOutcomeSections` parser (which is heading-driven), and the narrative renders in the appropriate slot — pairs with the v2 player report's Feeding section design (`memory/project_dt_report_v2.md`).

### Edge cases

**Given** the submission's feeding status is `no_feed` (player did not feed this cycle)
**Then** the textarea still renders (an ST may want to write narrative about the choice not to feed, or the consequences of not feeding).
**And** the existing "No feeding this cycle." message stays visible above the textarea.

**Given** a historical submission predates DTSR-7 and has no `st_narrative.feeding_narrative` field
**Then** the textarea renders empty; saving creates the field.
**And** the published outcome (already published) is unchanged unless re-published or inline-edited via DTSR-4.

---

## Implementation Notes

### Field shape

```js
st_narrative.feeding_narrative = {
  response:       string,
  author:         string,
  status:         'draft' | 'complete' | 'needs_revision',
  revision_note:  string,
}
```

Same shape as `letter_from_home`, `touchstone`, `home_report`, etc. Reuse the `saveNarrativeField(id, patch)` helper exported from `downtime-story.js` (line 9 of the module docstring).

### Render addition in renderFeedingValidation

After the existing closing `</dl>` at line 1136, before `</div></div>`, add:

```js
const fn = stNarrative?.feeding_narrative || {};
const fnText = fn.response || '';
const fnStatus = fn.status || 'draft';
const fnRevNote = fn.revision_note || '';
const fnComplete = fnStatus === 'complete';
const fnDotClass = fnComplete ? 'dt-story-dot-complete' : 'dt-story-dot-pending';
const isRevision = fnStatus === 'needs_revision';

h += `<div class="dt-feed-val-narrative-block">`;
h += `<div class="dt-story-section-subhead">Storyteller narrative</div>`;
h += `<div class="dt-story-section-prompt">What happened during the feeding that mattered — what did others see, what did the player do, what consequences carry forward?</div>`;
h += `<textarea class="dt-story-response-ta dt-feed-narrative-ta" placeholder="Write the feeding narrative…">${esc(fnText)}</textarea>`;
h += `<div class="dt-story-card-actions">`;
h += `<button class="dt-story-save-draft-btn">Save Draft</button>`;
h += `<button class="dt-story-revision-note-btn${isRevision ? ' active' : ''}">Needs Revision</button>`;
h += `<button class="dt-story-mark-complete-btn">`;
h += `<span class="dt-story-completion-dot ${fnDotClass}"></span> Mark Complete`;
h += `</button>`;
h += `</div>`;
// Revision area block — same pattern as renderLetterFromHome
h += `<div class="dt-story-revision-area${isRevision || fnRevNote ? '' : ' hidden'}">`;
h += `<textarea class="dt-story-revision-ta" rows="2" placeholder="Revision note for player…">${esc(fnRevNote)}</textarea>`;
h += `<div class="dt-story-card-actions">`;
h += `<button class="dt-story-revision-save-btn">Save Revision</button>`;
h += `</div>`;
h += `</div>`;
h += `</div>`;
```

### Save handler

Add a `feeding_validation` entry to `SECTION_SAVE_HANDLERS` (or extend the existing one if it already exists for the approve-feeding action) that routes the Save Draft / Mark Complete button clicks to a handler that writes:

```js
{ 'st_narrative.feeding_narrative': { response, author, status, revision_note } }
```

Use `saveNarrativeField` if it provides the right shape; otherwise call `apiPut` directly with the patch shape used by other sections.

### compilePushOutcome change

In `compilePushOutcome` at line 2923-2924, replace:

```js
if (key === 'feeding_validation') {
  continue; // feeding handled separately via feeding_roll; no authored narrative response
```

with:

```js
if (key === 'feeding_validation') {
  if (sn.feeding_narrative?.status === 'complete') {
    const response = sn.feeding_narrative?.response;
    if (response?.trim()) {
      parts.push(`## Feeding\n\n${response.trim()}`);
      hasContent = true;
    }
  }
  // No gap text: feeding narrative is optional; missing narrative just omits the section
  continue;
}
```

The `## Feeding` heading is the section identifier the player-side parser recognises.

### Schema verification

Open `server/schemas/downtime_submission.schema.js`. If `st_narrative.additionalProperties: true`, no change required. If explicit allow-list, add `feeding_narrative` with shape mirroring the other narrative fields.

### Strawman wording

- Sub-head: "**Storyteller narrative**"
- Prompt: *"What happened during the feeding that mattered — what did others see, what did the player do, what consequences carry forward?"* (the em-dash here should be replaced with an en-dash or rephrased per the British-English / no-em-dashes rule; verify at implementation)
- Textarea placeholder: "Write the feeding narrative…"

### No tests required

UI + persistence + publish-blob inclusion. Manual smoke test:
- Open Feeding on a submission with a validated roll: textarea renders, write text, Save Draft, refresh, persist.
- Mark Complete, refresh, complete state persists.
- Publish (or re-publish via DTSR-4 inline edit): assembled blob contains `## Feeding\n\n<text>`.
- Open the player Story view (or DTP feeding tab) for the same submission: narrative appears in the Feeding section.
- Submission with no narrative authored: published blob contains no Feeding section; player view's mechanical feeding card still renders unchanged.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js`:
  - `renderFeedingValidation` extended with narrative textarea and action row.
  - Save handler dispatch extended to handle Feeding narrative writes.
  - `compilePushOutcome` feeding-section branch changed from `continue` to publish-when-complete.
- `server/schemas/downtime_submission.schema.js` — verify or add `st_narrative.feeding_narrative` field shape.

No client-side changes outside `downtime-story.js`.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises authoring, completion logic, publish inclusion, and player-side rendering.
- Verification: a submission with no feeding narrative still publishes correctly (no empty Feeding section in the blob).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-7-feeding-narrative-field: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Pairs naturally with `epic-dtp` (player report rendering); DTP delivery surfaces the new `## Feeding` section content when present without further work, because it consumes `published_outcome` via the existing parser.
- Could optionally be coordinated with DTSR-4 (inline edit) so STs can author the narrative on previously-published cycles; not blocking either way.
