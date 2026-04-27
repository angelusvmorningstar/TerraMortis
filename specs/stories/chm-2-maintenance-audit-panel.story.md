---
id: chm.2
epic: chm
status: ready-for-dev
priority: medium
depends_on: [chm.0, chm.1]
---

# Story CHM-2: Maintenance audit panel on chapter-finale DT Prep

As a Storyteller preparing the final downtime cycle of a chapter,
I should see a single panel listing every character who holds a maintenance-eligible standing merit (Professional Training, Mystery Cult Initiation), with one checkbox per merit per character to mark "this player has confirmed maintenance for this chapter",
So that I can sweep the at-risk roster in one place before publishing the cycle, instead of cross-referencing player submissions against every PT/MCI holder by hand.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 3 (Chapter & Maintenance Layer), audit surface story. Today there is no system-level signal that a player needed to maintain their standing merit this chapter — STs catch lapses by memory or not at all. CHM-2 surfaces the at-risk list in the one place the ST is already working at the end of a chapter (DT Prep on the finale cycle).

The panel is **manual oversight**, not automated detection. The memory explicitly defers auto-derivation of maintenance from project action types ("Out of scope: auto-detection of maintenance from project action types"). The ST decides what counts as maintained based on what they see in submissions and game memory. CHM-2 just gives them the at-risk roster and a checkbox grid.

The visibility gate is `cycle.is_chapter_finale === true`, set on the cycle via the DT Prep checkbox shipped in CHM-1. On non-finale cycles, the panel does not render at all — no empty placeholder, no "no audit needed" copy. Pure conditional.

The merit-name list comes from the `MAINTENANCE_MERITS` constant shipped in CHM-0 (`public/js/tabs/downtime-data.js`). Do not re-derive the list by string literal.

### Files in scope

- `public/js/admin/downtime-views.js` — add a `renderMaintenanceAuditPanel(cycle)` helper, called from `renderPrepPanel` after the existing prep grid; wire change handlers through `updateCycle`.
- `public/admin.html` — add a `<div id="dt-maintenance-audit-panel">` slot inside the DT Prep area (or render it appended to the existing `dt-prep-panel` if simpler).
- `public/css/admin-layout.css` — minimal styling for the audit table (rows, checkboxes, character-name column). Reuse existing tokens (no new colour/font tokens).

### Out of scope

- The player-facing at-risk warning strip (**CHM-3**).
- Auto-detection of maintenance from project action types — the ST sets the checkboxes by hand based on whatever evidence they want (submission content, memory, side-channel chat).
- Per-cult granularity for MCI: a character with multiple Mystery Cult Initiation merits gets a **single** MCI checkbox that covers all their cults collectively. Per-cult tracking is a future story if it becomes painful in practice.
- Surfacing the audit on Push Ready, ST Processing, City & Feeding, or anywhere outside DT Prep.
- Server-side enforcement — the audit is a UI affordance only; nothing is gated, blocked, or cascaded based on the ticked state in this story.
- Historical audit trail — there is no per-tick timestamp or `who-ticked` log; the map is a flat boolean state. If an audit log becomes useful later, add it then.

---

## Acceptance Criteria

### Visibility

**Given** I am an ST viewing the DT Prep panel for a cycle where `is_chapter_finale !== true`
**When** the panel renders
**Then** the maintenance audit panel is **not rendered** at all (no empty container, no header, no placeholder).

**Given** I am an ST viewing the DT Prep panel for a cycle where `is_chapter_finale === true`
**When** the panel renders
**Then** I see the maintenance audit panel below the existing prep grid (or in a dedicated slot below the early-access toggles), with a clear heading such as "Chapter Finale — Maintenance Audit" and the chapter label (from `cycle.chapter_label` if set, else the session's `chapter_label` if available, else nothing) shown as supporting text.

### Roster contents

**Given** the audit panel is visible
**Then** it lists every active (non-retired) character who holds at least one merit whose `name` ∈ `MAINTENANCE_MERITS`.
**And** characters who hold neither PT nor MCI are absent.
**And** retired characters are absent.

**Given** a character row in the audit
**Then** the character's display name appears (use `displayName(c)` from `public/js/data/helpers.js`).
**And** the row sorts alphabetically by `sortName(c)` (consistent with other admin character lists).

### Per-row controls

**Given** a character holds Professional Training
**Then** the row shows a "PT" checkbox.
**And** the checkbox reflects the current value of `cycle.maintenance_audit[character_id].pt` (unchecked when missing).

**Given** a character does **not** hold Professional Training
**Then** the row shows **no** PT checkbox (the column for PT renders as empty space, or omits the input entirely — visual consistency over data fidelity here).

**Given** a character holds at least one Mystery Cult Initiation merit
**Then** the row shows an "MCI" checkbox.
**And** the checkbox reflects the current value of `cycle.maintenance_audit[character_id].mci` (unchecked when missing).
**And** if the character has more than one MCI merit (multiple cults), a small label below the checkbox lists the cult names (comma-separated) so the ST has context. Single MCI: no extra label needed (or just the cult name if `m.cult_name` is present).

**Given** a character holds **both** PT and at least one MCI
**Then** both checkboxes appear in the same row.

### Persistence

**Given** I tick or untick a PT checkbox for character X
**When** the change handler fires
**Then** `cycle.maintenance_audit[X].pt` is set to the new boolean and the cycle is updated via `updateCycle` (PUT `/api/downtime_cycles/:id`).
**And** if `cycle.maintenance_audit` did not previously exist, it is initialised as `{}` first.
**And** if `cycle.maintenance_audit[X]` did not previously exist, it is initialised with both `pt: false` and `mci: false` and then the changed flag is set.

**Given** I tick or untick an MCI checkbox for character X
**Then** the same persistence rule applies for `cycle.maintenance_audit[X].mci`.

**Given** I reload the DT Prep panel after ticking some boxes
**Then** the previously-ticked checkboxes are still ticked.

### Edge cases

**Given** there are zero characters who hold a maintenance-eligible merit
**When** the panel renders
**Then** it shows a single placeholder line such as "No characters hold Professional Training or Mystery Cult Initiation." (Render the heading and the placeholder; do not render the table.)

**Given** the cycle's `is_chapter_finale` flag is toggled off after some checkboxes were ticked
**Then** the audit panel disappears on next render.
**And** the ticked state on `cycle.maintenance_audit` is **preserved** in the cycle document (do not auto-delete on flag-off — STs may toggle the flag on and off as they correct mistakes; we do not want their work to evaporate).

---

## Implementation Notes

### Helper extraction

Add a helper in `public/js/admin/downtime-views.js`:

```js
import { MAINTENANCE_MERITS } from '../tabs/downtime-data.js';
import { displayName, sortName } from '../data/helpers.js';

function maintenanceEligibleChars(allChars) {
  return (allChars || [])
    .filter(c => !c.retired)
    .filter(c => (c.merits || []).some(m => MAINTENANCE_MERITS.includes(m.name)))
    .sort((a, b) => sortName(a).localeCompare(sortName(b)));
}

function charHoldings(c) {
  const merits = c.merits || [];
  const pt  = merits.some(m => m.name === 'Professional Training');
  const mciMerits = merits.filter(m => m.name === 'Mystery Cult Initiation' && m.active !== false);
  return { pt, mci: mciMerits.length > 0, mciCults: mciMerits.map(m => m.cult_name).filter(Boolean) };
}
```

Note the `m.active !== false` guard on MCI — that matches the existing pattern in `edit.js:1034` and `edit-domain.js:442` (multi-MCI handling).

### Render

`renderMaintenanceAuditPanel(cycle)` is called from `renderPrepPanel` after the existing grid + early-access section. Conditional on `cycle.is_chapter_finale === true`. The panel renders into a dedicated slot — either `<div id="dt-maintenance-audit-panel">` added to `admin.html` near the prep panel, or appended to `dt-prep-panel` directly (whichever keeps the DOM cleaner).

Render shape (strawman):

```html
<section class="dt-maintenance-audit">
  <h4 class="dt-maintenance-title">Chapter Finale — Maintenance Audit</h4>
  <p class="dt-maintenance-sub">Tick a box once you have confirmed the player has maintained this standing merit during the chapter.</p>
  <table class="dt-maintenance-table">
    <thead><tr><th>Character</th><th>PT</th><th>MCI</th></tr></thead>
    <tbody>
      <!-- rows here -->
    </tbody>
  </table>
</section>
```

Each row is one character. Empty cell where the character doesn't hold the merit. No checkboxes for merits the character lacks.

### Persistence handler

```js
async function setMaintenance(cycle, charId, key, value) {
  const audit = { ...(cycle.maintenance_audit || {}) };
  audit[charId] = { pt: false, mci: false, ...(audit[charId] || {}), [key]: value };
  await updateCycle(cycle._id, { maintenance_audit: audit });
  cycle.maintenance_audit = audit;
  const idx = allCycles.findIndex(c => c._id === cycle._id);
  if (idx >= 0) allCycles[idx].maintenance_audit = audit;
}
```

Sending the entire `maintenance_audit` object on each tick is fine at this roster scale (≤30 characters). If write thrash becomes a concern later, switch to a `$set` on a sub-key via a dedicated route — not in this story.

### Styling

Reuse existing admin tokens. The table inherits the dt-card / dt-prep look; do not introduce new colour or font tokens. Per the CSS token system memory (`reference_css_token_system.md`), zero bare hex in rule bodies — all values via `var(--*)`.

Strawman styles:
- `.dt-maintenance-audit` — top margin to separate from early-access section, same bg as the dt-card surrounding the prep panel.
- `.dt-maintenance-title` — same tier as existing prep section titles (font-family `var(--fh2)`, uppercase, accent colour).
- `.dt-maintenance-table` — full-width, dense rows (`padding: .35rem .5rem`), borders via `var(--surf3)` or whatever the existing prep table uses.

### No tests required

UI panel + cycle-document write. Manual smoke test is sufficient: as ST, mark a cycle as Chapter Finale via CHM-1's checkbox, see the audit panel appear, tick boxes, refresh, verify state.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js` — new `renderMaintenanceAuditPanel(cycle)` helper and supporting filters; called from `renderPrepPanel`. Persistence handler that patches `cycle.maintenance_audit` via `updateCycle`.
- `public/admin.html` — new DOM slot for the audit panel (if not appended to `dt-prep-panel` directly).
- `public/css/admin-layout.css` — minimal styling for `.dt-maintenance-audit`, `.dt-maintenance-table`, header/sub.

No server changes (existing `PUT /api/downtime_cycles/:id` accepts the additional `maintenance_audit` field).

---

## Definition of Done

- All AC verified.
- Manual smoke test:
  - Set `is_chapter_finale = true` on a prep cycle via CHM-1's checkbox; audit panel appears.
  - Set it false; panel disappears, persisted ticks remain on the document.
  - Tick a PT box, refresh, verify it stays ticked.
  - Tick an MCI box for a character with multiple MCIs; verify the cult names render correctly as supporting text.
  - Verify retired characters are excluded.
  - Verify characters holding neither PT nor MCI are excluded.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `chm-2-maintenance-audit-panel: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- **Depends on CHM-0** for the `MAINTENANCE_MERITS` constant.
- **Depends on CHM-1** for the `is_chapter_finale` flag — without it, the panel has no visibility gate and the story has no trigger.
- **Independent of CHM-3** in either direction. CHM-2 is the ST audit; CHM-3 is the player warning. They consume the same data shape but neither blocks the other.
