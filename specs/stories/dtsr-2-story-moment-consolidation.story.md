---
id: dtsr.2
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: [dtsr.1]
---

# Story DTSR-2: Consolidate Letter and Touchstone into a single Story Moment section

As a Storyteller authoring downtime narratives,
I should see a single "Story Moment" section in the DT Story tab that lets me write either a letter-from-home or a touchstone vignette (my choice via a format radio at authoring time), with a single saved field on the submission,
So that the authoring surface matches the v2 player report (which renders one Story Moment section, not two) and I am not asked to fill in two separate sections when only one will be delivered to the player.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform), follow-up to DTSR-1's reorder. The v2 player report (`memory/project_dt_report_v2.md`) defines the player-facing structure as:

> Six-section report: Story Moment → Home Report → Feeding → Projects → Merit Summary → Rumours

Today's admin DT Story tab still authors Letter from Home and Touchstone as two separate sections, both of which feed into the player's Story Moment slot. DTSR-2 consolidates the authoring surface to match: one section, one saved narrative field, format chosen by the ST at the moment of writing.

**Format selection is decoupled from NPC interaction type.** The earlier scoping considered tying letter-vs-vignette to the player's NPC `interaction_type` field, but the memory locks the simpler call:

> Story Moment format (vignette vs letter) decoupled from Epic 6: ST chooses format at authoring time via radio, NPC `interaction_type` is hint only. Avoids cross-epic dependency.

So the radio toggle is purely a Story-tab UI affordance; the player's submission may include hints (a player who corresponds with a long-distance NPC suggests "letter"; a player who has Touchstone-themed material suggests "vignette") but the ST is the authority.

The consolidated saved shape is:

```js
st_narrative.story_moment = {
  response:       string,             // the narrative text
  format:         'letter' | 'vignette',
  author:         string,             // ST username, as today
  status:         'draft' | 'complete' | 'needs_revision',
  revision_note:  string,
}
```

**Back-compat reads** are mandatory: existing submissions have `st_narrative.letter_from_home` or `st_narrative.touchstone` populated. When the consolidated section opens such a submission, it must surface the legacy data correctly with no migration script.

### Files in scope

- `public/js/admin/downtime-story.js` — primary surface:
  - `getApplicableSections` (~line 778): replace the two entries `letter_from_home` and `touchstone` with one entry `story_moment`.
  - Routing dispatchers around line 1052: replace the two `case` arms with one for `story_moment`.
  - `renderLetterFromHome` (line 1372) and `renderTouchstone` (line 1468): merge into a new `renderStoryMoment` that includes the format radio.
  - `buildLetterContext` (line 1278) and `buildTouchstoneContext` (line 1345): keep both as helpers; the new `renderStoryMoment` calls the appropriate one based on the chosen format.
  - Section save handlers (~line 26 `SECTION_SAVE_HANDLERS`): replace the two letter/touchstone entries with one `story_moment` entry.
  - Short-label map (~line 977): replace `letter_from_home: 'Letter'` and `touchstone: 'Touchstone'` with one `story_moment: 'Story Moment'`.
  - Completion-check map (~line 307): same — replace two entries with one.
  - Copy-context routing (~line 189): replace the two if-branches with one for `story_moment`.

- `server/schemas/downtime_submission.schema.js` — verify `st_narrative.story_moment` is acceptable. Likely no schema change required if `st_narrative.additionalProperties: true`; otherwise add the field shape explicitly.

- DT form player surface — **no change in this story**. The DT form still writes player-side fields as it does today; the player UI consolidation around the 3-way picker is NPCP-2's territory. DTSR-2 changes the ST authoring side only.

### Out of scope

- Player DT form changes (NPCP-2 already covers the 3-way picker conversion to free text; this story does not touch player UI).
- Migration of historical submissions from `letter_from_home`/`touchstone` to `story_moment`. Back-compat reads cover the gap; no destructive migration runs in this story.
- Changes to `MERIT_SECTIONS`, `_collapseComplete` set, or any other state container that's keyed on the two old section keys — those simply stop receiving entries; no pruning required.
- Changes to the `published_outcome` rendering on the player side (paired with `epic-dtp` stories; not in this story).
- Removing the legacy field readers from `published_outcome` payloads or the player Story view — leave those readers in place so historical cycles continue to render.
- Re-derivation of `format` from NPC `interaction_type` or player submission hints — the radio is fully ST-controlled.

---

## Acceptance Criteria

### Section presence and order

**Given** I am an ST viewing the DT Story tab for any submission
**When** the section nav renders
**Then** the section list contains a single "**Story Moment**" entry where Letter and Touchstone used to be — at the top of the list (per DTSR-1's order: Story Moment → Home Report → Feeding → Project Reports → Allies & Asset Summary → Rumours).

**Given** I open the Story Moment section
**Then** I see (in this order, top to bottom):
1. A format selector — two radio options, "Letter from Home" and "Touchstone Vignette".
2. The combined player-context block (the touchstone list and the player's submitted letter or vignette text — see "Combined context block" below).
3. The narrative response textarea.
4. The standard Save Draft / Needs Revision / Mark Complete action row.

### Format selection

**Given** I open Story Moment for a submission with no `st_narrative.story_moment.format` saved yet
**Then** the radio defaults to **"Letter from Home"** (lock the default so STs land on the more common case; they can flip to Vignette).

**Given** I select a format and write narrative text
**When** I save (draft or complete)
**Then** `st_narrative.story_moment.format` is persisted as either `'letter'` or `'vignette'`.

**Given** I have draft text saved at one format and I switch the radio
**Then** the existing draft text is **preserved** in the textarea (do not clear on radio change; STs may flip to compare framing without losing work).

### Combined context block

**Given** I open Story Moment for any submission
**Then** the context block surfaces:
- The character's touchstone list (same shape as current `renderLetterFromHome` / `renderTouchstone` — name, humanity, attached/detached state).
- The player's submitted letter / message / personal text — read with the same fallback chain currently used in `renderLetterFromHome` (`responses.correspondence` → `responses.letter_to_home` → `responses.letter` → `responses.narrative_letter` → `responses.personal_message`), plus any equivalent fallback used by `renderTouchstone` if different.
- If NPCP-2 has shipped, the new free-text NPC reference (`responses.personal_story_npc_text`) is also surfaced as part of the block; if it has not, the legacy `personal_story_npc_id`-resolved name is surfaced instead. (See NPCP-2 for the resolver pattern.)

**Given** the context block is rendering
**Then** it is collapsible per the existing pattern (collapsed by default if a draft response is already saved, expanded if not).

### Copy Context

**Given** I click the "Copy Context" button on the Story Moment section
**When** the active format is "Letter from Home"
**Then** the prompt copied to clipboard is the output of `buildLetterContext(char, sub)` (unchanged).

**Given** the active format is "Touchstone Vignette"
**Then** the prompt copied is the output of `buildTouchstoneContext(char, sub)` (unchanged).

### Persistence

**Given** I write narrative text, choose a format, and click Save Draft or Mark Complete
**Then** the submission's `st_narrative.story_moment` field is saved as the documented shape (response, format, author, status, optional revision_note).
**And** the legacy fields `st_narrative.letter_from_home` and `st_narrative.touchstone` are **not modified** by the save (do not auto-clear them; do not auto-mirror into them).

**Given** I reload the DT Story tab
**Then** my saved Story Moment renders correctly: format radio reflects the saved format, textarea shows the saved response, completion dot reflects the saved status.

### Back-compat reads

**Given** an existing submission where `st_narrative.letter_from_home.response` is populated and `st_narrative.story_moment` is missing
**When** an ST opens DT Story
**Then** the Story Moment section pre-fills with:
- Format radio set to `'letter'`
- Textarea pre-filled with the legacy letter response
- Completion status mirrored from the legacy section's status
- A small inline note like "Loaded from Letter from Home" (~grey label) so the ST is aware they're editing legacy content
**And** if the ST saves, the new save writes `st_narrative.story_moment`; the legacy `letter_from_home` field stays where it is (do not delete or mirror).

**Given** an existing submission where `st_narrative.touchstone.response` is populated and `st_narrative.story_moment` is missing
**Then** same behaviour but the format radio defaults to `'vignette'` and the inline note reads "Loaded from Touchstone Vignette".

**Given** a submission has **both** legacy sections populated
**Then** prefer `letter_from_home` for pre-fill (more common case); the inline note labels the source clearly. The ST can flip the radio and the textarea retains the loaded text — switching format does not pull in the other legacy section's text. (Edge case rare enough that we accept the simple rule.)

### Removal verification

**Given** the codebase
**When** any code dispatches on section key
**Then** there are **no remaining branches** dispatching on `'letter_from_home'` or `'touchstone'` for **rendering**, **section-list inclusion**, or **save routing** — those identifiers persist only in **read-time** back-compat shims for legacy data.

**Given** an ST opens a brand-new submission with no narrative authored yet
**Then** Letter from Home and Touchstone do **not** appear as separate selectable sections anywhere in the DT Story nav.

---

## Implementation Notes

### Data shape

Add to the section-save router and any section-key dispatch:

```js
// st_narrative.story_moment = {
//   response:       '',
//   format:         'letter' | 'vignette',
//   author:         '',
//   status:         'draft' | 'complete' | 'needs_revision',
//   revision_note:  '',
// }
```

### renderStoryMoment

A pragmatic merge:

```js
function renderStoryMoment(char, sub, stNarrative) {
  // Read priority: new field → legacy letter → legacy touchstone
  const sm = stNarrative?.story_moment;
  const legacyLetter = stNarrative?.letter_from_home;
  const legacyTouchstone = stNarrative?.touchstone;

  let initialFormat = 'letter';
  let initialText = '';
  let initialStatus = 'draft';
  let legacyNote = '';

  if (sm) {
    initialFormat = sm.format || 'letter';
    initialText = sm.response || '';
    initialStatus = sm.status || 'draft';
  } else if (legacyLetter?.response) {
    initialFormat = 'letter';
    initialText = legacyLetter.response;
    initialStatus = legacyLetter.status || 'draft';
    legacyNote = 'Loaded from Letter from Home';
  } else if (legacyTouchstone?.response) {
    initialFormat = 'vignette';
    initialText = legacyTouchstone.response;
    initialStatus = legacyTouchstone.status || 'draft';
    legacyNote = 'Loaded from Touchstone Vignette';
  }

  // ...render header, format radio, combined context block, textarea, action row...
}
```

### Save routing

Replace the two existing letter/touchstone entries in `SECTION_SAVE_HANDLERS` with one `story_moment` handler that accepts the format from the active radio, alongside the response, and writes to `st_narrative.story_moment`.

### Schema verification

Open `server/schemas/downtime_submission.schema.js`. If `st_narrative` declares `additionalProperties: true` (likely), no change is required. If it has an explicit allow-list, add `story_moment` with shape:

```js
story_moment: {
  type: 'object',
  properties: {
    response:      { type: 'string' },
    format:        { type: 'string', enum: ['letter', 'vignette'] },
    author:        { type: 'string' },
    status:        { type: 'string', enum: ['draft', 'complete', 'needs_revision'] },
    revision_note: { type: 'string' },
  },
  additionalProperties: true,
}
```

Verify at implementation; do not blindly add if unnecessary.

### Prompt-builder reuse

Keep `buildLetterContext` and `buildTouchstoneContext` as separate helpers. Do **not** consolidate them. The Copy Context handler in the new `renderStoryMoment` picks the right helper based on the active radio:

```js
function handleCopyStoryMomentContext(btn) {
  const card = btn.closest('.dt-story-section');
  const format = card.querySelector('input[name="story-moment-format"]:checked')?.value || 'letter';
  const ctx = format === 'letter'
    ? buildLetterContext(char, sub)
    : buildTouchstoneContext(char, sub);
  // existing copy-to-clipboard logic
}
```

Two helpers, one dispatch site. If a future story wants a unified Story Moment prompt, that's its own scope.

### Strawman labels

- Section header: **"Story Moment"**
- Format radio options: **"Letter from Home"** and **"Touchstone Vignette"**
- Legacy load inline note: **"Loaded from Letter from Home"** / **"Loaded from Touchstone Vignette"** — small, muted styling (existing `.dt-story-note-author` or similar)
- Default format: **"Letter from Home"**

### No tests required

Pure UI consolidation with back-compat reads on legacy fields. Manual smoke test as per DoD.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — section list, render dispatcher, copy-context dispatcher, save handler registry, short-label map, completion-check map; `renderStoryMoment` added; `renderLetterFromHome` and `renderTouchstone` removed (or marked as legacy and unreferenced — choose deletion if no other consumer remains).
- `server/schemas/downtime_submission.schema.js` — verify or add `st_narrative.story_moment` field shape.

No client-side changes outside `downtime-story.js`. No data migration script.

---

## Definition of Done

- All AC verified.
- Manual smoke test:
  - Open DT Story for a fresh submission: Story Moment section appears at top, format radio defaults to Letter, textarea empty, Copy Context produces a letter prompt.
  - Switch radio to Vignette: textarea retains text, Copy Context produces a touchstone prompt.
  - Save Draft, refresh, verify both format and text persist.
  - Mark Complete, refresh, verify completion state.
  - Open a legacy submission (DT2) that has `st_narrative.letter_from_home.response` populated: Story Moment loads with Letter format and the legacy text pre-filled, inline note "Loaded from Letter from Home" visible.
  - Same for a submission with `st_narrative.touchstone.response`.
  - Save the legacy-loaded submission: new save writes `st_narrative.story_moment`; check the document directly to confirm `letter_from_home` is untouched.
  - Verify Letter from Home and Touchstone Vignette no longer appear as separate sections in the nav for any submission.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-2-story-moment-consolidation: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on DTSR-1** (section reorder + Rumours rename). DTSR-1 places Letter and Touchstone at the top of the order; DTSR-2 collapses them into one slot in that same position.
- **Independent of NPCP-2** in either direction. NPCP-2's free-text NPC reference is read by the Story Moment context block if present; if NPCP-2 has not shipped yet, the legacy `personal_story_npc_id` resolver continues to provide the NPC reference.
- Independent of all other DTSR / DTFP / DTIL / JDT / CHM stories.
