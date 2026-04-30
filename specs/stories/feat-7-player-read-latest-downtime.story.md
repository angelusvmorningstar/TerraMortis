---
id: feat.7
epic: feat
status: review
priority: medium
depends_on: []
---

# Story FEAT-7: Player Can Read Their Own Submitted Downtime Form

As a player viewing my Downtime tab on player.html,
I want to see what I submitted last cycle (my own raw form responses) — not just the ST's published narrative back to me,
So that I can refer to my own writing as context for this cycle's submission, settle internal "what did I actually say?" questions, and have a record of my own output.

---

## Context

### What already exists

The player Downtime tab renders **the ST's published narrative** for past cycles — the `published_outcome` field on each submission, fetched and rendered through the existing path:

- `public/js/tabs/downtime-tab.js:19-53` — fetches submissions, promotes `st_review.outcome_text → published_outcome`, filters for published.
- `public/js/tabs/downtime-form.js:987-1005` — the in-form "previous submissions" history view also renders `published_outcome` via `parseOutcomeSections`.
- `public/js/tabs/feeding-tab.js:107-160` — extracts the Feeding section from `published_outcome`.

The **player's own raw submission** — the `responses` object on the submission document, containing every field they typed into the form (project descriptions, action types, pool selections, narrative slots, highlights) — is **not surfaced** to the player anywhere on player.html.

### Why the gap matters

Players writing their next downtime want to refer back to: "what did I say last cycle about my project?", "what action type did I pick for that merit?", "what did I write in my Highlight #2?". These are not in the published narrative — the narrative is the ST's compiled response to the player. The player's own form responses are the *input*, the narrative is the *output*.

Today the player has to remember from memory or check their own notes. This story exposes the input back to them, read-only.

### What this story adds

A new sub-section in the player Downtime tab (or a new card in the existing previous-submissions history) that renders the player's own `responses` object as a structured, readable view. Read-only.

### Out of scope

- Editing past submissions. The submission is locked once the cycle closes; this story does not change that.
- Cross-character viewing. Players see only their own submissions (already enforced by existing role-scoping).
- Diffing player input against ST narrative ("you said X, ST said Y"). Just the raw player input.
- Re-rendering the form in its full UI shape. A flat structured display is sufficient; we are not recreating the form for read-only viewing.

---

## Acceptance Criteria

### Access path

**Given** the player is on player.html
**When** they navigate to the Downtime tab
**Then** there is a clear way to view their own submitted form for any past cycle (not only the most recent).
**And** the access path is one click from the existing previous-submissions list.

### Render shape — strawman

**Given** the player clicks to view their own submission for a past cycle
**Then** a panel renders showing the player's `responses` object as readable sections:
- **Court & Aspirations** — court_present, aspirations_short_term[], aspirations_long_term[].
- **Feeding** — feeding_method, feeding_pool, feeding_territories, feeding_narrative (when v2 ships per DTSR-7).
- **Projects** — for each `proj_N_*` group: title, description, target, action_type, pool selections.
- **Sorcery** — for each `sorcery_N_*` group: rite name, target, pool.
- **Merits** — for each merit-action group (allies / status / contacts / etc.): description, action_type, pool.
- **Game Highlights** — `game_recount_1` through `game_recount_5`, plus `mechanical_flag_N` if DTFP-7 has shipped.
- **XP Spends** — any XP spend groups.

Sections appear only when the player has data in them. Empty sections do not render.

### Read-only

**Given** the panel renders
**Then** all fields are read-only (no inputs, no editable areas).
**And** there is no Save button.
**And** the panel is visually distinct from the form (different background, "read-only" label or banner) so the player doesn't confuse it with the live form.

### Cycle selection

**Given** the player has submissions for multiple past cycles
**Then** they can switch between cycles via a dropdown or list — same affordance as the existing published-outcome history.

### Privacy

**Given** the existing API enforces that players see only their own characters' submissions
**Then** this story uses the same scoping. No new privacy gate needed.

### Coexistence with published narrative

**Given** the existing published-outcome rendering
**Then** it is **not removed**. Both views are accessible: "View your submission" and "View the ST's published narrative" are sibling options.

### Performance

**Given** the player has many past cycles
**Then** the rendering is lazy — the player picks one cycle to view; we don't render all submissions inline.

---

## Implementation Notes

### Data path

The player's `downtime_submissions` documents are already fetched in `public/js/tabs/downtime-tab.js`. The `responses` field is on each document. No new API call is needed; the data is already available client-side.

### Render module

Add a new function in `public/js/tabs/downtime-tab.js` (or a sibling helper file):

```js
function renderRawSubmission(sub) {
  if (!sub.responses) return '<p class="placeholder-msg">No submission data for this cycle.</p>';
  const r = sub.responses;
  let h = '<div class="raw-submission read-only">';
  h += '<div class="raw-banner">Read-only — your original submission</div>';

  if (r.court_present || r.aspirations_short_term?.length || r.aspirations_long_term?.length) {
    h += '<section><h4>Court &amp; Aspirations</h4>';
    if (r.court_present) h += `<p><strong>Court:</strong> ${esc(r.court_present)}</p>`;
    if (r.aspirations_short_term?.length) {
      h += '<p><strong>Short-term:</strong></p><ul>';
      r.aspirations_short_term.forEach(a => { h += `<li>${esc(a)}</li>`; });
      h += '</ul>';
    }
    // ... etc.
    h += '</section>';
  }

  // Feeding section
  // ... etc.

  h += '</div>';
  return h;
}
```

The render is a series of "if section has data, render it" blocks. No clever generic walker — keep it explicit so the dev can match field shapes deliberately.

### Where to surface the affordance

Two strawman options:

**A. Toggle on each previous-submissions history card.** Each entry in the existing history view (currently published-outcome only) gets a small "View my submission" button that flips the card body to the raw-submission render.

**B. Separate top-level button.** Add a "My Past Submissions" link or button on the Downtime tab header that opens a panel listing all past cycles the player has submitted to, each clickable to render the raw view.

**Recommendation: Option A.** Reason: it sits next to the published narrative, encouraging the player to compare the two without context-switching.

### Field reference

A complete inventory of `responses.*` fields can be derived from `public/js/tabs/downtime-form.js` — every field the form writes to `responses` is one the player typed. Use the form file as the source of truth for what to render.

### British English

UI strings: "Read-only — your original submission", "View my submission", "No submission data for this cycle." No em-dashes.

### Edge cases

- Submissions imported via DI-1 (DT1) have `responses: {}` (empty — DT1 was pre-form). The render handles this with the empty-state placeholder.
- Submissions where the player wrote nothing in a section: that section simply doesn't render.
- Submissions where the cycle is still active: the live form is the render path; this read-only view is for past cycles only. Gate on `cycle.status === 'closed'`.

---

## Files Expected to Change

- `public/js/tabs/downtime-tab.js` — add `renderRawSubmission` helper; wire toggle on each history card.
- `public/css/<player-app-css>.css` — small block for `.raw-submission` and `.raw-banner` styling. Reuse existing tokens.
- No schema changes. No new API endpoints.

---

## Definition of Done

- AC verified.
- Manual smoke test on at least 3 characters with rich submission data confirms the render is readable and complete.
- Existing published-outcome render is unchanged.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml`: `feat-7-player-read-latest-downtime: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- Pairs naturally with **DTSR-3** (active cycle scope, ready-for-dev) and **DTSR-4** (inline edit on historical cycles) — both touch the historical-cycle rendering surface. Coordinate file edits if landing close together.
- Independent of every other FEAT story.

---

## References

- `specs/epic-features.md` — does not list FEAT-7; sourced from sprint-status comment.
- `specs/stories/sprint-status.yaml` line ~360 — original framing.
- `public/js/tabs/downtime-tab.js:19-53` — existing fetch + render path.
- `public/js/tabs/downtime-form.js:987-1005` — existing previous-submissions history (published narrative only).
- `public/js/tabs/downtime-form.js` overall — source of truth for `responses.*` field inventory.
