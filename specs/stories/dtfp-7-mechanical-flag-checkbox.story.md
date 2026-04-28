---
id: dtfp.7
epic: dtfp
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTFP-7: Per-highlight mechanical-flag checkbox

As a player writing my game-night highlights,
I should be able to tick a small "this involved a mechanical effect" checkbox next to any individual highlight slot,
So that my Storyteller knows which highlight describes a real mechanical event hidden in the prose (e.g. "I used Awe on Bertram") versus pure colour, without forcing me to flag every highlight or interrupt my writing flow.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 2 (Player Form Polish):

> **DTF2.7** — Mechanical-flag checkbox per game highlight slot. Single boolean `mechanical_flag_N` per slot; ticked when player wants ST to track a mechanical event hidden in the prose. Existing `game_recount_*` (or renamed `game_highlights_*`) field stays as the prose container. Strawman highlight prompt: "What stood out for you tonight? Story moments, things you did, things that happened." Strawman flag label: "This involved a mechanical effect on another character or the world (flags this for your ST)."

Today's highlight section (`public/js/tabs/downtime-form.js:4187-4213`) renders 3-5 textarea slots as `game_recount_N` fields. There is no per-slot mechanical signal — the ST has to read every highlight and decide which ones describe events that need tracking versus pure flavour.

DTFP-7 adds **one boolean checkbox per slot** persisted as `responses.mechanical_flag_N` (matching the slot index). Ticking the box means "I'm telling the ST something happened that has mechanical weight in the world — please track it." Unticked is the default; the player only ticks when there's something real to flag.

This signal becomes the primary input for **DTIL-3** (auto-state derivation in the Action Queue): flagged highlights default to "Action Needed"; unflagged default to "Unread".

### Files in scope

- `public/js/tabs/downtime-form.js`:
  - `case 'highlight_slots'` at line 4187: add the checkbox row inside each `.dt-highlight-slot`.
  - Save logic at lines 365-377: persist `responses.mechanical_flag_N` for each slot.
- `server/schemas/downtime_submission.schema.js` — verify `responses.mechanical_flag_N` is acceptable (likely yes via `additionalProperties: true`).
- `public/css/<dt-form-css>.css` — small layout for the checkbox row beneath the textarea.

### Out of scope

- Renaming `game_recount_*` fields to `game_highlights_*`. The memory mentions the rename as optional ("or renamed"); v1 keeps the existing field names for back-compat. A separate cleanup story can do the rename if useful.
- Auto-detecting mechanical content from text. The flag is player-driven; no NLP, no keyword matching.
- Per-flag categories or sub-flags (e.g. "social mechanical" vs "physical mechanical"). v1 is a single boolean.
- Changing the prompt above the highlight slots. The memory provides a strawman ("What stood out for you tonight?...") but the existing prompt may already be sufficient; verify at implementation and tune only if obviously stale.
- Changing the visible-count logic (3 minimum, expanding to 4 and 5). Unchanged.
- ST-side rendering of flagged highlights. That's DTIL-3's territory (auto-state derivation). DTFP-7 only writes the field; DTIL reads.
- Changing the legacy `game_recount` blob field (single string) — kept as-is for back-compat read.

---

## Acceptance Criteria

### Render

**Given** I am a player on the DT form's highlight section
**Then** each visible highlight slot (initial 3, expanding to 4 or 5 as previous slots are filled) renders:
- The existing label "Highlight N" (or "Highlight N (optional)" for slots 4-5).
- The existing textarea (`game_recount_N`).
- A new checkbox row immediately below the textarea, with the label:
  > *"This involved a mechanical effect on another character or the world (flags this for your ST)."*
- The checkbox reflects the current value of `responses.mechanical_flag_N` (unchecked when missing).

**Given** a slot is hidden (e.g. slot 5 not yet revealed)
**Then** its checkbox is also hidden — it appears when the slot reveals.

### Persistence

**Given** I tick the checkbox on slot 2
**When** the form saves
**Then** `responses.mechanical_flag_2` is set to `true`.

**Given** I untick the checkbox on slot 2
**Then** `responses.mechanical_flag_2` is set to `false` (or removed; either is acceptable as long as readers treat absent as `false`).

**Given** I save the form, refresh, and reload my draft
**Then** the checkbox state is preserved per slot.

**Given** the highlight slot has no text but the checkbox is ticked
**Then** save still persists the checkbox state — the player may have ticked the box first and is about to write the prose.

**Given** the highlight slot has text but the checkbox is unticked
**Then** save persists the text without the flag.

### Visual

**Given** the checkbox row renders
**Then** it sits **immediately below** the textarea, indented or aligned visually so it reads as part of the slot.
**And** the checkbox label is in muted typography (smaller font, grey colour) so it doesn't compete with the highlight prose.
**And** the row is single-line on desktop (label wraps if narrow viewport).

### Default

**Given** a brand-new highlight slot
**Then** the checkbox is **unchecked** by default.

### Back-compat

**Given** a legacy submission with no `mechanical_flag_*` fields
**Then** loading the draft renders all checkboxes unchecked.
**And** save behaviour is unchanged for unticked slots (no fields written for unticked).

### Server

**Given** the schema validation runs
**Then** `responses.mechanical_flag_1` through `mechanical_flag_5` are accepted as `boolean`.

### Counts

**Given** any number of slots are visible (3, 4, or 5)
**Then** each visible slot has its checkbox.
**And** the checkbox is associated with the same `n` as the textarea.

---

## Implementation Notes

### Render change

In `case 'highlight_slots'` at line 4204-4209, extend each slot's render:

```js
for (let n = 1; n <= 5; n++) {
  const hidden = n > visibleCount ? ' style="display:none"' : '';
  const flagChecked = saved[`mechanical_flag_${n}`] === true;
  h += `<div class="dt-highlight-slot" data-highlight-n="${n}"${hidden}>`;
  h += `<label class="qf-label">Highlight ${n}${n > 3 ? ' (optional)' : ''}</label>`;
  h += `<textarea id="dt-game_recount_${n}" class="qf-textarea dt-highlight-input" data-highlight-n="${n}" rows="2" placeholder="One highlight…">${esc(slotVals[n - 1])}</textarea>`;
  h += `<label class="dt-highlight-flag">`;
  h += `<input type="checkbox" id="dt-mechanical_flag_${n}" data-mechanical-flag-n="${n}"${flagChecked ? ' checked' : ''}>`;
  h += `<span class="dt-highlight-flag-text">This involved a mechanical effect on another character or the world (flags this for your ST).</span>`;
  h += `</label>`;
  h += '</div>';
}
```

### Save logic

In the highlight section save code at lines 365-377, after collecting `game_recount_N` values, add:

```js
for (let n = 1; n <= 5; n++) {
  const flagEl = document.getElementById(`dt-mechanical_flag_${n}`);
  if (flagEl) {
    responses[`mechanical_flag_${n}`] = flagEl.checked;
  }
}
```

Verify the save trigger: the existing textarea save fires on input/change; the checkbox needs a similar `change` event listener (or the existing form-wide debounced save catches it). If form-wide save is the model, the checkbox is captured on the next save tick — verify at implementation.

### Schema

In `server/schemas/downtime_submission.schema.js`, if `responses.additionalProperties: true`, no change needed. If explicit allow-list, add the keys `mechanical_flag_1` through `mechanical_flag_5` as `boolean`.

### CSS

```css
.dt-highlight-flag {
  display: flex;
  align-items: flex-start;
  gap: .5rem;
  margin-top: .35rem;
  font-size: .8em;
  color: var(--txt3);
  cursor: pointer;
}
.dt-highlight-flag input[type="checkbox"] {
  margin-top: 2px;            /* align with first line of text */
}
.dt-highlight-flag-text {
  line-height: 1.4;
}
```

Reuse existing tokens; verify token names against the project's CSS (`var(--txt3)` for muted text — confirm exists).

### British English

Verify the strawman label uses British English spelling (no US variants) and contains no em-dashes. The phrase "another character or the world" is fine as is.

### No tests required

Render + persistence change. Manual smoke test:
- Open DT form highlight section: every visible slot shows its checkbox.
- Tick slot 2: save, refresh, verify ticked state persists.
- Untick: save, refresh, verify unticked.
- Type into slot 4 to reveal slot 5: slot 5 also shows its checkbox.

### Strawman wording

- Checkbox label: **"This involved a mechanical effect on another character or the world (flags this for your ST)."** ✓ user-strawman per memory
- Optional refinement at implementation if the wording feels too long for one line: shorten to "Flag for ST: mechanical effect on another character or the world" or similar.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — `case 'highlight_slots'` slot render extended; save logic extended.
- `public/css/<dt-form-css>.css` — new `.dt-highlight-flag` and `.dt-highlight-flag-text` rules. Reuse tokens.
- `server/schemas/downtime_submission.schema.js` — verify or add `mechanical_flag_N` field shape (likely no change).

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises tick/untick on several slots, slot expansion, refresh persistence.
- No regression on highlight textarea behaviour (legacy `game_recount` import, slot-reveal logic).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtfp-7-mechanical-flag-checkbox: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies.
- **Blocks DTIL-3** (auto-state derivation from `mechanical_flag_N`). DTIL-3 reads this field; DTFP-7 must ship first for DTIL-3 to have data to read.
- Independent of every other DTSR / DTFP / NPCP / CHM / JDT story.
