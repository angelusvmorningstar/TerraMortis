---
id: dtsr.11
epic: dtsr
status: ready-for-dev
priority: low
depends_on: []
---

# Story DTSR-11: Global "collapse completed cards" toggle in DT Story

As a Storyteller working through a downtime cycle in the DT Story tab,
I should be able to flip a single global toggle that collapses every completed section card across every character (in addition to the existing per-character toggle), with my preference remembered between page reloads,
So that I can quickly hide the "done" noise across all submissions and focus on what's still outstanding, without clicking the per-character collapse for every character one at a time.

---

## Context

`memory/project_dt_overhaul_2026-04-27.md` — Epic 1 (Story Surface Reform). Folded in from `specs/deferred-work.md` "DT Story UX 2026-04-17":

> **DTS1.11** — Collapse-completed-cards toggle in DT Story (per-character or global toggle to collapse section cards where `status === 'complete'`)

The **per-character** collapse already exists: each character view has a "Collapse complete" / "Show all" button at `public/js/admin/downtime-story.js:1018`, backed by the `_collapseComplete` Set and a CSS selector pattern at `public/css/admin-layout.css:7114-7118`:

```css
.dt-story-char-content[data-collapse-complete="true"] .dt-story-section.complete > *:not(.dt-story-section-header) { display: none; }
```

DTSR-11 adds the **global** counterpart: a single toggle in the DT Story tab header (near the existing Publish All affordance) that collapses completed cards across every currently-rendered character, with state persisted to localStorage so the preference survives page reloads.

The design respects the existing per-character toggle: a card is collapsed if **either** per-character OR global collapse is active. A character's individual toggle continues to work independently of the global state.

### Files in scope

- `public/js/admin/downtime-story.js`:
  - Render a global toggle button in the nav-rail header (alongside Publish All).
  - Wire the toggle to flip a panel-level class or attribute, and persist preference to localStorage.
- `public/css/admin-layout.css`:
  - Add a global selector pattern that mirrors the existing per-character collapse rules, gated on the new global attribute/class.

### Out of scope

- Removing or refactoring the per-character toggle. It stays as today.
- Cross-cycle persistence. The preference is per-session-or-localStorage; no per-cycle memory.
- Auto-collapse on page load if everything is complete. v1: the toggle starts where the user left it (localStorage default OFF on first load).
- Animation / transition on collapse. Snap is fine.
- Filter by section type ("collapse only Feeding" etc.). v1 is binary: collapse all complete cards or show all.
- Combining the global toggle with the DTSR-9 flag inbox. The flag inbox is its own panel; the global toggle has no effect on it.
- Global toggle for player Story view. Players don't have completed-vs-pending state in the same way; out of scope.

---

## Acceptance Criteria

### Toggle placement and behaviour

**Given** I am an ST viewing the DT Story tab
**Then** in the nav-rail header (alongside the existing Publish All button), I see a button labelled "**Collapse complete (all)**" when the global toggle is OFF, or "**Show all (all)**" when ON.

**Given** I click the global toggle ON
**Then** every currently-rendered character's `.dt-story-char-content` (or its parent panel container) has the `data-collapse-complete-global="true"` attribute applied.
**And** every completed section card across every character collapses to show only its header (mirroring the per-character behaviour).
**And** the toggle button updates its label to "Show all (all)".

**Given** I click the global toggle OFF
**Then** the `data-collapse-complete-global` attribute is removed.
**And** completed cards expand back to their full state — **except** for cards where the per-character toggle was independently active for that character (those stay collapsed under the per-character rule).

### Interaction with per-character toggle

**Given** the global toggle is ON
**When** I click a specific character's per-character "Show all" button
**Then** that character's view expands its completed cards.
**And** the global toggle stays ON; other characters' cards remain collapsed.
**And** the per-character toggle's label flips to indicate it's overriding the global state (e.g. "Show all (overrides global)" — strawman; final wording at implementation).

**Given** both global and per-character collapse are ON for a character
**Then** that character's cards stay collapsed.

**Given** global is OFF and per-character is ON for some character
**Then** only that character's cards are collapsed; others are expanded (unchanged from current per-character behaviour).

### Persistence

**Given** I toggle global ON
**When** I reload the page
**Then** the toggle is **still ON**; the preference was persisted to localStorage (key e.g. `tm_dt_story_collapse_global`).

**Given** I toggle global OFF
**When** I reload the page
**Then** the toggle is **OFF** (default).

**Given** I open the DT Story tab for the first time on a new browser
**Then** the global toggle defaults to OFF.

### Visual consistency

**Given** the global toggle is ON
**Then** completed cards display the same collapsed treatment as the per-character toggle — section header visible, body hidden, dot/badge state unchanged.

**Given** mixed completion state across the cycle
**Then** the toggle correctly affects only `.complete` cards; `.draft` and `.pending` cards remain expanded regardless of toggle state.

---

## Implementation Notes

### Toggle render

In the rail header at line 838 (where Publish All renders), add:

```js
if (isST) {
  h += `<div class="dt-story-rail-header">`;
  h += `<button class="dt-story-publish-all-btn">Publish All</button>`;
  const globalActive = isCollapseGlobalActive();
  h += `<button class="dt-story-collapse-global-btn${globalActive ? ' active' : ''}">`;
  h += `${globalActive ? 'Show all (all)' : 'Collapse complete (all)'}`;
  h += `</button>`;
  h += `</div>`;
}
```

### Persistence helpers

```js
const COLLAPSE_GLOBAL_KEY = 'tm_dt_story_collapse_global';

function isCollapseGlobalActive() {
  return localStorage.getItem(COLLAPSE_GLOBAL_KEY) === '1';
}

function setCollapseGlobal(active) {
  if (active) localStorage.setItem(COLLAPSE_GLOBAL_KEY, '1');
  else localStorage.removeItem(COLLAPSE_GLOBAL_KEY);
}
```

### Click handler

Add to the existing rail-level event delegation at line 146:

```js
const globalBtn = e.target.closest('.dt-story-collapse-global-btn');
if (globalBtn) {
  const newActive = !isCollapseGlobalActive();
  setCollapseGlobal(newActive);
  applyGlobalCollapse(newActive);
  globalBtn.textContent = newActive ? 'Show all (all)' : 'Collapse complete (all)';
  globalBtn.classList.toggle('active', newActive);
  return;
}

function applyGlobalCollapse(active) {
  const charContents = document.querySelectorAll('.dt-story-char-content');
  for (const el of charContents) {
    if (active) el.dataset.collapseCompleteGlobal = 'true';
    else delete el.dataset.collapseCompleteGlobal;
  }
}
```

### Initial state on render

In `renderCharacterView` at line 1006, propagate the global state into the character-content attribute on first render:

```js
const globalActive = isCollapseGlobalActive();
const collapseAttrs = `${collapseActive ? ' data-collapse-complete="true"' : ''}${globalActive ? ' data-collapse-complete-global="true"' : ''}`;
let h = `<div class="dt-story-char-content"${collapseAttrs}>`;
```

So newly-rendered characters inherit the global state without needing a separate apply step.

### CSS additions

Mirror the existing per-character rules at lines 7114-7118 with global counterparts:

```css
/* Global collapse — mirrors per-character pattern */
.dt-story-char-content[data-collapse-complete-global="true"] .dt-story-proj-card.complete > *:not(.dt-story-proj-header),
.dt-story-char-content[data-collapse-complete-global="true"] .dt-story-merit-card.complete > *:not(.dt-story-merit-header),
.dt-story-char-content[data-collapse-complete-global="true"] .dt-story-cs-slot.complete > *:not(.dt-story-cs-slot-header),
.dt-story-char-content[data-collapse-complete-global="true"] .dt-story-section.complete > *:not(.dt-story-section-header),
.dt-story-char-content[data-collapse-complete-global="true"] .dt-story-terr-section.complete > *:not(.dt-story-terr-header) {
  display: none;
}
```

This way an element is collapsed if EITHER attribute is true.

### Per-character override label (optional)

The strawman acceptance criterion suggests the per-char toggle's label flips to "Show all (overrides global)" when global is ON. Implementation: the existing per-char toggle render already takes `_collapseComplete.has(charId)`; check `isCollapseGlobalActive()` alongside and pick a label. Optional refinement; if dropped, the per-char toggle's behaviour is still correct, just its label is less informative. Acceptable trade-off.

### Strawman wording

- Global toggle (OFF): "**Collapse complete (all)**"
- Global toggle (ON): "**Show all (all)**"
- Per-char toggle (when global ON): "**Show all (overrides global)**" (optional)

The "(all)" suffix distinguishes the global from the per-character toggle visually. Final wording at implementation.

### No tests required

UI + localStorage. Manual smoke test:
- Toggle ON, scroll through characters, verify all complete cards collapse.
- Toggle OFF, all expand.
- With global ON, click per-char "Show all" on one character → that character expands; others stay collapsed.
- Reload, global state persists.

---

## Files Expected to Change

- `public/js/admin/downtime-story.js` — global toggle button render in rail header; localStorage helpers; `applyGlobalCollapse` function; click handler in event delegation; initial-state propagation in `renderCharacterView`; optional per-char label refinement.
- `public/css/admin-layout.css` — global counterpart selectors at the same location as the existing per-character collapse rules.

No schema, no API, no server changes.

---

## Definition of Done

- All AC verified.
- Manual smoke test exercises toggle ON/OFF, persistence across reload, per-char override interaction.
- File list in completion notes matches actual changes.
- `specs/stories/sprint-status.yaml` updated: `dtsr-11-collapse-completed-cards: backlog → ready-for-dev → in-progress → review` as work proceeds.

---

## Dependencies and ordering

- No upstream dependencies. Independent of every other story.
- Compatible with all other DTSR / DTFP / DTIL / JDT changes — collapse rules apply to whatever sections exist at render time.
- Closes the Epic 1 (Story Surface Reform) story set when shipped.
