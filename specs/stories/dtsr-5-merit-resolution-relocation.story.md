---
id: dtsr.5
epic: dtsr
status: ready-for-dev
priority: medium
depends_on: []
---

# Story DTSR-5: Relocate merit Outcome resolution from sidebar into the main panel slot

As a Storyteller resolving a merit action in DT Processing,
I should see the Outcome controls (Approved / Partial / Failed + outcome summary) in the **main panel** of the merit action card — in the same column where I read the action details — instead of tucked into the right sidebar between the Effect chip and the ST Notes,
So that the merit panel structure aligns with the four-zone canon (Action Definition / Pool Builder / Outcome / Status) mandated by `specs/epic-dt-processing-consistency.md`, and resolution is co-located with the context I'm reading rather than off in the sidebar.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). Today's merit panel spreads Outcome controls into the right sidebar (`_renderCompactMeritPanel` at `public/js/admin/downtime-views.js:5216` and the equivalent block in `_renderMeritRightPanel` at line 5300). That places the resolution controls in the same column as the Effect chip and the ST Notes, with the action details (Desired Outcome + Description) sitting separately in the left column's Details card.

The result is a structural mismatch with the four-zone canon documented in `specs/epic-dt-processing-consistency.md`:

> 1. Zone 1 — Action Definition (type, target, territory, details)
> 2. Zone 2 — Pool Builder (attr + skill + disc + modifiers)
> 3. Zone 3 — Outcome (successes, vitae, thresholds)
> 4. Zone 4 — Status (button row: Pending / Validated / Skip / etc.)

The four-zone canon places **Outcome** in the main panel between Pool Builder and Status — not in a sidebar. DTSR-5 implements this for **merit panels only**; project, feeding, and sorcery panels are out of scope (they have their own four-zone alignment work in the broader epic-dt-processing-consistency epic).

The slot the Outcome controls move into is the area currently occupied by what the memory calls the "**Story context block**" — the descriptive context that surrounds the merit's identity (Details card, narrative slot, or whatever element sits between header and right sidebar). The exact current element will be identified at implementation by the dev; the structural goal is what's locked.

### Files in scope

- `public/js/admin/downtime-views.js` — primary surface. Specifically:
  - `_renderCompactMeritPanel` (line 5216): remove the Outcome zone from the compact right-side panel; emit it as part of the left-column Outcome block instead.
  - `_renderMeritRightPanel` (line 5300): remove the Outcome zone from the rolled merit right-side panel; emit it as part of the left-column Outcome block instead.
  - `renderActionPanel` (line 6124) and the merit-detail block at lines 6197-6230: add a new "Outcome" zone slot in the left column between the Details card and any Status row, and render the Outcome controls there.
- `public/css/admin-layout.css` — minor spacing/layout adjustments to accommodate the moved zone. No new tokens.

### Out of scope

- Project panels, feeding panels, sorcery panels — DTSR-5 is **merit panels only**, per memory.
- Non-Outcome content in the existing right sidebar (Action Mode chip, Effect chip, Auto Successes, ST Notes thread) — those stay in the sidebar.
- The full four-zone refactor for merit panels; DTSR-5 is a **partial** implementation that lifts only the Outcome zone. Pool Builder, Status, and Action Definition stay where they currently are.
- Any change to the saved data shape (`rev.merit_outcome`, `rev.outcome_summary`, `rev.notes_thread`, etc.). The handlers stay wired to the existing inputs; only the inputs' DOM position moves.
- Any change to the prompt-builder context generators (`buildActionContext` etc. in `downtime-story.js`). Outcome data still flows through to DT Story unchanged.
- Schema or API changes — none required.

---

## Acceptance Criteria

### Layout — what moves

**Given** I am an ST resolving a rolled merit action (e.g. Allies dice-pool action)
**When** the panel renders
**Then** the **Outcome zone** — containing the Approved / Partial / Failed buttons (`.proc-merit-outcome-btn`) and the one-line outcome summary input (`.proc-outcome-summary-input`) — appears in the **left/main column** of the panel, below the Details card and above (or alongside) the Status / validation row.
**And** the Outcome zone **no longer appears** in the right sidebar.

**Given** I am an ST resolving a compact merit action (auto/blocked/contacts/retainer category, or formula `none`)
**When** the panel renders
**Then** the same rule holds: Outcome zone in the main column, removed from the compact right-side panel.

**Given** I am resolving a merit action whose mode is `blocked`
**Then** the Outcome zone is **not rendered** at all (per current logic — blocked actions have no resolution to author). This is unchanged.

### Layout — what stays

**Given** any merit panel render
**Then** the right sidebar continues to host:
- Action Mode chip
- Effect chip(s) (Effect / Auto effect)
- Automatic Successes panel (auto mode)
- Block Resolution panel (block action type)
- Success Modifier ticker (if rolled)
- ST Notes thread

**And** the left column continues to host:
- Merit header (category chip, qualifier, dots)
- Details card (Desired Outcome, Description, edit affordance)
- (NEW) Outcome zone — relocated from the right sidebar
- Validation status buttons (or wherever the Status zone currently lives for merit panels)

### Behaviour preservation

**Given** I click an Approved / Partial / Failed button
**Then** the existing handler at line 4364 fires unchanged: `saveEntryReview(entry, { merit_outcome: btn.dataset.outcome, pool_status: 'resolved' })`.
**And** the `.active` class flips correctly to reflect the new selection.

**Given** I edit the outcome summary input
**Then** the existing input handler at line 4376 fires unchanged.

**Given** I reload the page after setting an outcome
**Then** the saved outcome and summary persist and re-render in the new (relocated) position.

### CSS / visual

**Given** the relocated Outcome zone renders
**Then** it visually presents as a clear, distinct zone within the left column — consistent with the existing Details card chrome — not as a stripe of buttons floating between other content.
**And** the zone has a clear label ("Outcome", title-cased) using the existing `proc-mod-panel-title` style.
**And** spacing/margins are consistent with the surrounding zones (Details above, Status below).

**Given** the right sidebar after Outcome relocation
**Then** the sidebar is **shorter** (Outcome controls removed); the remaining contents (Mode/Effect/Notes) flow naturally without dangling whitespace or visual gaps.

### Four-zone alignment (partial)

**Given** the relocated panel
**Then** read top-to-bottom in the left column: Action Definition (header + Details) → (Pool Builder, where applicable, in its existing position) → Outcome (relocated) → Status. This matches the four-zone canon for merit panels.

---

## Implementation Notes

### Identify the "Story context block"

The memory phrases the move as "lift Outcome panel from sidebar into slot replacing Story context block". The dev should identify which element in the current merit panel acts as the "Story context block" — most likely the area between the Details card and the right sidebar, or a placeholder that doesn't carry weight. If no such block exists by name, the Outcome zone goes into the natural position: below the Details card, above any existing Status row, in the left column.

If the Details card and the new Outcome zone end up adjacent, that's the right shape. The Details card stays as it is; Outcome is a new block below it.

### Reuse existing DOM and handlers

The existing DOM nodes (`.proc-merit-outcome-btn`, `.proc-outcome-summary-input`) carry the data attributes the handlers depend on (`data-proc-key`, `data-outcome`). Move the **node**; do not change its identifiers. Handlers at lines 4364 and 4376 will continue to work without modification.

The left-column Outcome zone HTML mirrors what's currently in the right sidebar at line 5256-5266:

```js
function _renderMeritOutcomeZone(entry, rev, isBlocked) {
  if (isBlocked) return '';
  const key = entry.key;
  const outcome = rev.merit_outcome || '';
  const outcomeSummary = rev.outcome_summary || '';
  let h = `<div class="proc-feed-mod-panel proc-merit-outcome-zone" data-proc-key="${esc(key)}">`;
  h += `<div class="proc-mod-panel-title">Outcome</div>`;
  h += `<div class="proc-merit-outcome-btns">`;
  for (const [val, label] of [['approved', 'Approved'], ['partial', 'Partial'], ['failed', 'Failed']]) {
    h += `<button class="proc-merit-outcome-btn${outcome === val ? ' active' : ''}" data-proc-key="${esc(key)}" data-outcome="${val}">${label}</button>`;
  }
  h += `</div>`;
  h += `<input type="text" class="proc-outcome-summary-input" data-proc-key="${esc(key)}" value="${esc(outcomeSummary)}" placeholder="One-line outcome summary (shown to player)...">`;
  h += `</div>`;
  return h;
}
```

Extract this helper and call it from the merit-rendering site in the left column. Then **remove** the equivalent block from `_renderCompactMeritPanel` (lines 5256-5267) and from `_renderMeritRightPanel` (the corresponding block, after lines 5394 — the Outcome zone in the right panel of rolled merit actions).

### CSS additions

```css
.proc-merit-outcome-zone {
  /* match the chrome of the surrounding left-column blocks */
  /* same border, padding, background as .proc-feed-desc-card if visually consistent */
  margin-top: .75rem;
}
```

Reuse existing tokens; no new colour or font tokens.

### No tests required

UI restructuring with handler reuse. Manual smoke test in the four merit-panel modes:

1. Auto-mode merit (e.g. Allies status auto-action): Outcome zone in the left column, three buttons + summary input, behaves identically.
2. Rolled merit (e.g. Allies attack with dice pool): Outcome zone in left column below pool builder.
3. Compact merit (Contacts request): Outcome zone in left column.
4. Blocked merit: no Outcome zone (unchanged).

For each, save Approved/Partial/Failed selection, refresh, verify persistence.

### Strawman label

"Outcome" — single word, title-cased, matches existing `.proc-mod-panel-title` styling.

---

## Files Expected to Change

- `public/js/admin/downtime-views.js`:
  - New helper `_renderMeritOutcomeZone(entry, rev, isBlocked)` (or inline equivalent).
  - Removal of the Outcome block from `_renderCompactMeritPanel` (lines 5256-5267).
  - Removal of the Outcome block from `_renderMeritRightPanel`'s right-side rendering (locate the equivalent block in the rolled-merit branch; remove it).
  - Insertion of the Outcome zone into the merit-rendering left-column block in `renderActionPanel` (around lines 6230, after the Details card emit).
- `public/css/admin-layout.css` — small spacing rules for `.proc-merit-outcome-zone`, reusing existing tokens.

No JS handler changes (existing handlers at lines 4364 and 4376 remain wired by class selectors).

---

## Definition of Done

- All AC verified.
- Manual smoke test as ST in DT Processing on a real cycle (or dev fixture):
  - Open every merit panel mode (auto, rolled, compact, blocked) — Outcome zone is in the correct position for each.
  - Set outcome on each, save, refresh, verify persistence.
  - Verify the right sidebar no longer shows Outcome controls in any merit panel.
  - Verify project, feeding, and sorcery panels are **unchanged** (smoke-test one of each as a regression check).
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-5-merit-resolution-relocation: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other DTSR / DTFP / DTIL / JDT story.
- Aligns with the broader **`specs/epic-dt-processing-consistency.md`** epic. DTSR-5 is a partial implementation of that epic's structural goal for merit panels specifically; the broader epic's other stories (project / feeding / sorcery four-zone alignment) remain pending.
- Independent of DTSR-6 (merit summary format verification), but if DTSR-6 reveals a needed change to the merit summary structure, it lands in its own story.
