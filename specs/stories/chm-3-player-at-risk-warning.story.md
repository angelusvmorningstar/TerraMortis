---
id: chm.3
epic: chm
status: ready-for-dev
priority: medium
depends_on: [chm.0, chm.1, chm.2]
---

# Story CHM-3: Player at-risk warning strip on chapter-finale Personal Projects

As a player whose character holds Professional Training or Mystery Cult Initiation,
When I open the DT form for the final cycle of the chapter and my ST has not yet logged my standing merit as maintained,
I should see a clear warning at the top of my Personal Projects section telling me that this is my last chance to use a project slot to maintain the merit before it lapses,
So that I do not silently forfeit the standing merit because I assumed someone else was tracking it.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 3 (Chapter & Maintenance Layer), player-facing surface story. CHM-2 gives the ST the audit roster; CHM-3 closes the loop by surfacing the at-risk state to the player who is about to file projects without addressing maintenance.

The warning is **defensive copy** — it does not block the player from filing other projects, does not auto-fill a maintenance project, and does not force confirmation. It just makes the at-risk state visible at the moment the player is choosing what to do with their slots.

The player UI translates the schema state into natural language (per memory `feedback_player_natural_language.md`): no "MCI", no "is_chapter_finale", just plain English about the merit and what the player should do.

### Read sources

The warning's render gate combines three reads:

1. **`currentCycle.is_chapter_finale === true`** — set by ST in CHM-1.
2. **Character holds a merit where `m.name` ∈ `MAINTENANCE_MERITS`** — using the constant from CHM-0.
3. **The corresponding entry in `currentCycle.maintenance_audit[currentChar._id]` is missing or `false` for that merit** — written by ST in CHM-2.

If all three are true for a given merit, the warning for that merit renders. If both PT and MCI are at risk, two stacked warnings render.

### Files in scope

- `public/js/tabs/downtime-form.js` — `renderProjectSlots(saved)` (~line 2099); add a warning strip render before the existing `<h4 class="qf-section-title">` line, gated on the three-read combination above.
- `public/css/` (whichever file contains the existing `.qf-section` / `.dt-proj-tabs` styles, likely `public/css/downtime.css` or equivalent — verify at implementation) — minimal styling for `.dt-maintenance-warning` (alert tone, but consistent with the existing player-form palette; reuse tokens, no bare hex).

### Out of scope

- Auto-flagging the player's project as a Maintenance project. The player still chooses Maintenance from the action dropdown (which CHM-0 already made visible).
- Server-side enforcement preventing the player from submitting without maintenance. The warning is informational; submission is still allowed.
- A persistent dismissal mechanism ("don't show me this again"). The warning is meant to nag every render until the ST ticks the audit box.
- ST-side reflection of "player has filed a maintenance project this cycle" — the audit checkbox in CHM-2 stays manual; the ST decides what counts as maintained, not the player's action selection. (Future story: auto-suggest a tick when a player files a Maintenance project, deferred per memory.)
- Any change to the existing Maintenance dropdown option shipped in CHM-0.
- Warning surfaces on tabs other than the DT form's Personal Projects section.

---

## Acceptance Criteria

### Visibility — positive cases

**Given** the active cycle's `is_chapter_finale === true`
**And** my character holds Professional Training (`m.name === 'Professional Training'`)
**And** `cycle.maintenance_audit[my_char_id].pt` is **not** `true` (i.e. missing, undefined, false, or the audit object itself is missing)
**When** I open the DT form and scroll to the Personal Projects section
**Then** a warning strip is rendered at the top of the section (before the section title or immediately after it), saying something like:
> *"Maintenance reminder. Your Professional Training has not been logged as maintained this chapter. This is the last cycle of the chapter, so use one of your projects below to maintain it, or it will lapse."*

**Given** the same conditions but for Mystery Cult Initiation
**Then** a warning strip is rendered with the same shape but referring to "Mystery Cult Initiation".
**And** if the character has multiple MCI merits, the warning text refers to "Mystery Cult Initiation" generally (single warning), and lists the cult names parenthetically if they are easy to read.

**Given** a character holds **both** PT and MCI and both are at risk
**Then** two warnings render, stacked, one per merit, in this order: PT first, MCI second.

### Visibility — negative cases

**Given** `currentCycle.is_chapter_finale !== true`
**Then** no warning renders, regardless of audit state or merit holdings.

**Given** the character holds neither PT nor MCI
**Then** no warning renders, regardless of cycle finale state.

**Given** the character holds PT and `cycle.maintenance_audit[char_id].pt === true`
**Then** the PT warning does not render.
**And** if MCI is also at risk, the MCI warning still renders.

**Given** the character is opening the DT form for a **non-active** cycle (e.g. viewing a historical/closed cycle in read-only mode)
**Then** the warning does **not** render — it is only meaningful for the cycle the player can still act on.

### Copy

**Given** a warning is rendered
**Then** the copy uses British English (e.g. "Maintenance reminder", not "Maintenance reminder!" with US-style alarmism; use existing player-form tone).
**And** the copy contains no em-dashes (en-dashes or commas instead).
**And** the merit name appears as its full canonical name (e.g. "Mystery Cult Initiation", not "MCI") — the player UI does not surface the schema slug.

Strawman wording (final tuned at implementation):

> **Maintenance reminder.** Your **Professional Training** has not been logged as maintained this chapter. This is the last cycle of the chapter, so use one of your projects below to maintain it, or it will lapse.

> **Maintenance reminder.** Your **Mystery Cult Initiation** has not been logged as maintained this chapter. This is the last cycle of the chapter, so use one of your projects below to maintain it, or it will lapse.

If MCI lists more than one cult, append `(Iron Tower, Children of Cain)` or similar to the merit name in the copy.

### Visual

**Given** a warning is rendered
**Then** it visually distinguishes itself from regular intro copy — use an existing alert/warning styling pattern from elsewhere in the player form (e.g. the same treatment used for blocking intros, deadline reminders, or any existing player notice).
**And** if no existing pattern fits, introduce a single new class `.dt-maintenance-warning` styled with subdued amber/gold accent (reusing existing token like `var(--gold2)` or the warning token if one exists) — no new colour tokens.

---

## Implementation Notes

### Render site

In `renderProjectSlots(saved)` at `public/js/tabs/downtime-form.js:2099`, the section opens with:

```js
let h = '<div class="qf-section collapsed" data-section-key="projects">';
h += `<h4 class="qf-section-title">${esc(section.title)}<span class="qf-section-tick">✔</span></h4>`;
h += '<div class="qf-section-body">';
if (section.intro) h += `<p class="qf-section-intro">${esc(section.intro)}</p>`;
```

Add the warning render between `<div class="qf-section-body">` and the intro paragraph:

```js
h += renderMaintenanceWarnings(currentChar, currentCycle);
```

Implement `renderMaintenanceWarnings` as a small local helper at the top of `tabs/downtime-form.js` (or near `renderProjectSlots` for locality):

```js
import { MAINTENANCE_MERITS } from './downtime-data.js';

function renderMaintenanceWarnings(char, cycle) {
  if (!cycle || cycle.is_chapter_finale !== true) return '';
  const audit = cycle.maintenance_audit?.[String(char._id)] || {};
  const out = [];

  // PT
  const hasPT = (char.merits || []).some(m => m.name === 'Professional Training');
  if (hasPT && audit.pt !== true) {
    out.push(maintenanceWarningHtml('Professional Training', null));
  }

  // MCI
  const mciMerits = (char.merits || []).filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false);
  if (mciMerits.length && audit.mci !== true) {
    const cults = mciMerits.map(m => m.cult_name).filter(Boolean);
    out.push(maintenanceWarningHtml('Mystery Cult Initiation', cults));
  }

  return out.join('');
}

function maintenanceWarningHtml(meritName, cultNames) {
  const meritLabel = cultNames && cultNames.length
    ? `${meritName} (${cultNames.join(', ')})`
    : meritName;
  return `<div class="dt-maintenance-warning">
    <strong>Maintenance reminder.</strong>
    Your <strong>${esc(meritLabel)}</strong> has not been logged as maintained this chapter.
    This is the last cycle of the chapter, so use one of your projects below to maintain it, or it will lapse.
  </div>`;
}
```

`MAINTENANCE_MERITS` is imported but the helper above checks merit names directly because PT and MCI need different strawman text (cult names for MCI). Importing the constant is still useful as the source of truth — declaring `MAINTENANCE_MERITS` at the top of the file lets future maintainers see the gate set.

### Cycle-status guard

Negative AC says the warning should not render on non-active (historical/closed) cycles. The DT form's `currentCycle` resolution at `tabs/downtime-form.js:770` already filters to `LIVE_STATUSES.includes(c.status)`, so by the time the warning renderer runs, `currentCycle` is the active one. No extra guard needed unless smoke-testing reveals an edge case where a player can load the form against a non-live cycle (in which case, gate explicitly on `LIVE_STATUSES`).

### Styling

If a `.dt-warning` / `.dt-notice` / similar pattern already exists in the player form CSS, use it. Otherwise add a single new class:

```css
.dt-maintenance-warning {
  border: 1px solid var(--gold2);
  background: rgba(0, 0, 0, 0.25); /* or whatever token equivalent the existing player notices use */
  padding: .75rem 1rem;
  margin-bottom: 1rem;
  border-radius: 4px;
  font-size: .9rem;
}
.dt-maintenance-warning strong {
  color: var(--gold2);
}
```

Per the CSS token system memory, no bare hex literals — use `var(--*)` tokens for all colour values. The `rgba(0, 0, 0, 0.25)` example above should be replaced with the equivalent token-driven value at implementation (likely `var(--surf2)` or similar transparency overlay).

### No tests required

UI render path. Manual smoke test:
- As a PT character on a finale cycle with PT not ticked: warning appears.
- ST ticks PT box: refresh form, warning disappears.
- ST unticks: warning reappears on next form open.
- Non-finale cycle: no warning regardless.
- Both PT and MCI at risk: two warnings stacked.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — new `renderMaintenanceWarnings(char, cycle)` and `maintenanceWarningHtml(...)` helpers; one-line call in `renderProjectSlots` to render the strip at the top of the Personal Projects section body.
- `public/css/<player-form-css-file>.css` — single new class `.dt-maintenance-warning` (or reuse of an existing alert pattern). Verify the right file at implementation.

No server changes, no schema changes (consumes shapes already established in CHM-1 and CHM-2).

---

## Definition of Done

- All AC verified.
- Manual smoke test in browser as a PT character (e.g. one of the campaign's PT holders): warning appears on a finale cycle when PT box unticked, disappears when ticked.
- Same for MCI character.
- Same for character with both PT and MCI: two warnings render in order.
- Non-finale cycle: no warning even with at-risk merits.
- Character with neither PT nor MCI: no warning ever.
- Copy reads naturally to a player who has never seen the schema (no jargon, no field names).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `chm-3-player-at-risk-warning: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on CHM-0** for the `MAINTENANCE_MERITS` constant.
- **Depends on CHM-1** for `cycle.is_chapter_finale`.
- **Depends on CHM-2** for `cycle.maintenance_audit[char_id].{pt,mci}` — without it, the warning renders for every PT/MCI holder on every finale cycle and never disappears.
- Closes Epic CHM as the final player-facing piece.
