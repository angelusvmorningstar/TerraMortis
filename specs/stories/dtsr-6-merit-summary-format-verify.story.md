---
id: dtsr.6
epic: dtsr
status: ready-for-dev
priority: low
depends_on: []
---

# Story DTSR-6: Verify and align renderMeritSummary to the "Merit / Desired outcome / Results" format

As a Storyteller scanning the merit summary in the DT Story tab,
I should see each merit action listed as **Merit name (qualifier and dots) / Desired outcome / Results**, instead of the current **Merit / Action type / Results** layout,
So that I can scan what the player actually wanted out of the action (their stated goal), not just what mechanical action type they nominated, when reviewing whether the outcome I authored serves the player's intent.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). The memory locks the canonical merit summary format:

> **DTS1.6** — Verify `renderMeritSummary` matches "Allies (Police 3) / Desired outcome / Results" format

Today's `renderMeritSummary` at `public/js/admin/downtime-story.js:1768` builds three-column rows:

| Column | Source | Example |
|---|---|---|
| 1 — Merit label | `getMeritDetails(char, a).label` | `Allies (Police 3)` |
| 2 — Action type | `ACTION_TYPE_LABELS[a.action_type]` | `Attack` |
| 3 — Outcome summary | `rev.outcome_summary` | `Successfully tailed the suspect` |

The target format per memory replaces column 2 (Action type) with the player's **Desired outcome** (the prose they wrote describing what they were trying to achieve with the action). The action type remains accessible — DT Processing already shows it on the resolution panel — but the summary is the player's intent line, not the mechanical category.

The data is available: each merit action carries `desired_outcome` (set in DT Processing's Edit Details affordance, see `desired_outcome` references at `downtime-views.js:6225`). The `meritDesiredOutcome` value is also surfaced on `entry.meritDesiredOutcome` at line 1835.

This is a **verification-and-align story**, small in code but explicit about the format. If a future review changes the format again, this story serves as the canonical statement of what the rendered shape should be.

### Files in scope

- `public/js/admin/downtime-story.js` — `renderMeritSummary` (line 1768): change column 2 from action type to desired outcome; verify column 1 label (with qualifier and dots) and column 3 (outcome summary) match the target.
- `public/css/` (whichever file styles `.dt-merit-summary-row`, likely `admin-layout.css`): verify the three-column grid still reads naturally with the new content; adjust column widths if needed.

### Out of scope

- Schema changes — `desired_outcome` already exists on action entries.
- Renaming the section label "Allies & Asset Summary" to "Merit Summary" — the section's display label is independent of the row format and not in the memory's locked scope.
- Changing the merit summary's empty state, action row order, category grouping, or completion logic.
- Rendering on the player side (the player Story view's merit summary card is the DTP epic's territory).
- Adding a fourth column (Action type) — the action type is omitted from this row format; STs see it elsewhere.

---

## Acceptance Criteria

### Row format

**Given** I open the DT Story tab on a submission with at least one merit action
**When** the Allies & Asset Summary section renders
**Then** each row shows three columns in this order:
1. **Merit name with qualifier and dots** — e.g. `Allies (Police 3)`, `Status (Carthian)`, `Retainer (Bartender 2)`. Use the existing `getMeritDetails(char, a).label` value, which already produces this string for merits that have a qualifier and dots.
2. **Desired outcome** — the player's prose describing what they wanted to achieve, read from the action's `desired_outcome` field (or the equivalent canonical field). If the player did not write a desired outcome, render the placeholder `— No desired outcome stated —`.
3. **Results** — the ST's outcome summary, read from `rev.outcome_summary` as today. If the outcome has not been recorded yet, the existing `— Outcome not yet recorded —` placeholder is unchanged.

**Given** the row format above
**Then** the row is visually clear: each column has its own slot in a CSS grid, with appropriate widths so a long Desired outcome wraps within its column rather than pushing Results off-screen.

### What's removed

**Given** the new row format
**Then** the **action type** (e.g. `Attack`, `Investigate`, `Patrol / Scout`) **no longer appears** as column 2.
**And** the action type is not appended elsewhere on the same row (no parenthetical, no tooltip required).

### Edge cases

**Given** a merit action where `desired_outcome` is missing or empty
**Then** column 2 renders the placeholder `— No desired outcome stated —` (consistent typographic treatment with the existing column 3 placeholder).

**Given** a skipped merit action (`rev.pool_status === 'skipped'`)
**Then** the row is omitted from the summary (unchanged from current logic).

**Given** a merit action whose label cannot be resolved (no `getMeritDetails` match)
**Then** column 1 falls back to `a.merit_type || 'Merit'` (unchanged from current logic).

### Section label

**Given** the section header
**Then** it reads "**Allies & Asset Summary**" — unchanged from current. (DTSR-6 does not rename the section label.)

### Visual

**Given** the rendered merit summary
**Then** rows align as a tidy three-column grid; column widths are roughly: 25% for Merit, 40% for Desired outcome, 35% for Results (tune at implementation for readability).

---

## Implementation Notes

### Source the desired outcome

The action's desired-outcome text is available as `a.desired_outcome` (the field is read into `entry.meritDesiredOutcome` at `downtime-views.js:1835`). In the `renderMeritSummary` group-builder loop:

```js
const desiredOutcome = a.desired_outcome?.trim() || '';
```

### Update the row build

In `renderMeritSummary` at line 1786, replace the `actionType` field with `desiredOutcome`:

```js
groups[cat].push({
  meritLabel: meritLabel || a.merit_type || 'Merit',
  desiredOutcome: a.desired_outcome?.trim() || '',
  outcome: rev.outcome_summary?.trim() || '',
});
```

In the row render at line 1806-1810:

```js
h += `<div class="dt-merit-summary-row${missingClass}">`;
h += `<span class="dt-merit-summary-merit">${esc(entry.meritLabel)}</span>`;
h += `<span class="dt-merit-summary-desired">${entry.desiredOutcome ? esc(entry.desiredOutcome) : '— No desired outcome stated —'}</span>`;
h += `<span class="dt-merit-summary-outcome">${entry.outcome ? esc(entry.outcome) : '— Outcome not yet recorded —'}</span>`;
h += `</div>`;
```

The `dt-merit-summary-action` class is replaced by `dt-merit-summary-desired`; either rename the CSS rule or alias it.

### CSS verification

Locate the existing `.dt-merit-summary-row` grid rules (likely in `public/css/admin-layout.css`) and verify the three-column layout still reads well with the new column 2 content. The Desired outcome column will typically hold longer text than the Action type did, so it may benefit from being the widest column.

Strawman grid template:

```css
.dt-merit-summary-row {
  display: grid;
  grid-template-columns: minmax(8rem, 1fr) minmax(12rem, 2fr) minmax(10rem, 1.5fr);
  gap: .75rem;
  align-items: start;
}
```

Tune at implementation; reuse existing tokens.

### Strawman placeholders

- Missing desired outcome: `— No desired outcome stated —`
- Missing results (unchanged): `— Outcome not yet recorded —`

Both with U+2014 em-dash equivalents using the en-dash or hyphen pattern? Per the British-English memory and "no em-dashes" rule, use the U+2014 em-dash characters in copy or replace with en-dash if the project's text style avoids em-dashes. Verify against existing placeholders in the file (the current code uses `—` for the em-dash in placeholders) — keep consistent with what's already there.

Actually, the project style explicitly avoids em-dashes. Replace existing `—` placeholders with en-dash `–` or simple text. Verify against the project's CSS / placeholder convention at implementation. (If this would expand into a wider audit of placeholder typography, defer that audit to its own story; DTSR-6 only changes what's required for the format alignment.)

### No tests required

UI render-format change. Manual smoke test: open DT Story for a submission with merit actions; verify column layout, placeholder rendering, and that a real desired-outcome string surfaces correctly.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — `renderMeritSummary` row content; remove action-type field from the row, add desired-outcome field.
- `public/css/admin-layout.css` (or wherever `.dt-merit-summary-row` lives) — verify column layout still reads well; rename `.dt-merit-summary-action` → `.dt-merit-summary-desired` if appropriate.

No schema changes, no API changes.

---

## Definition of Done

- All AC verified.
- Manual smoke test:
  - Open DT Story on a submission with at least one merit action with a populated `desired_outcome`: row shows Merit label / Desired outcome / Results.
  - On a row where `desired_outcome` is missing: the missing-desired placeholder appears.
  - On a row where `outcome_summary` is missing: the existing missing-outcome placeholder appears.
  - Skipped actions: row omitted (regression check).
  - Visual: rows align tidily, no horizontal overflow, columns read naturally.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-6-merit-summary-format-verify: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Independent of DTSR-5 (merit Resolution panel relocation in DT Processing). DTSR-5 affects DT Processing UI; DTSR-6 affects the DT Story summary row format.
- Compatible with the player-side merit summary delivery work in `epic-dtp` — that work consumes the same `outcome_summary` field; this story does not change that field's content.
