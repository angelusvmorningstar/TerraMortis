---
id: dtui.2
epic: dtui
status: ready-for-dev
priority: high
depends_on: []
---

# Story DTUI-2: `.dt-chip` and `.dt-chip-grid` components

As a player filling out the downtime form,
I want every "pick from a roster" interaction to use the same chip-grid visual and gesture,
So that targeting characters, picking territories, ticking invitees, or selecting maintenance items all feel like the same action.

---

## Context

Second story in the **DTUI epic** (foundation atomics wave). Introduces two related components:

1. **`.dt-chip`** — an atomic chip representing a single selectable entity (a character, a territory, an NPC, a merit, a maintenance item). Renders as a rounded rectangular button with a label and optional small suffix.
2. **`.dt-chip-grid`** — a layout container that holds `.dt-chip` children with selection semantics. Three variants: `single-select`, `multi-select`, `single-select-required`.

These are the second-most-reused new components after `.dt-ticker` (dtui-1). They unblock targeting (Character chips, Territory chips), Joint invitees, sphere-merit collaborators, NPC selectors, Maintenance item arrays, and the Court Acknowledge Peers grid. **Eight subsequent stories consume this component:**

- **dtui-8** (Wave 2) — per-action Target selector scoping (Character / Territory / Other chips)
- **dtui-11** (Wave 2) — Maintenance action target chip array
- **dtui-13** (Wave 3) — player invitee chip grid in Joint panel
- **dtui-14** (Wave 3) — sphere-merit collaborator chip grid in Joint panel
- **dtui-16** (Wave 3) — Allies Block target (character chip grid)
- **dtui-20** (Wave 4) — Court Acknowledge Peers chip grid
- **dtui-21** (Wave 4) — Personal Story NPC correspondent chips
- **dtui-23** (Wave 4) — Feeding territory chips (after relocation)

This story is **foundation only**: introduce both component classes, document their API, ship without changing any user-visible UI in the form. No regression risk — components added, not yet consumed.

### The patterns this generalises

The cleanest existing prototype is `.dt-npc-card` (Personal Story NPC picker):

- **CSS:** `public/css/components.css:3604-3623` — `.dt-npc-cards` flex-wrap container + `.dt-npc-card` chip with hover/selected states using clean tokens
- The `.dt-npc-card-selected` state uses `border-color: var(--gold2); background: var(--gold-a12);` — proven gold-on-dark contrast
- The container uses `flex-wrap: wrap; gap: 8px;` — simple responsive wrap

Two other existing patterns inform this design but don't fit cleanly:

- **`.dt-shoutout-grid`** (`components.css:3582-3601`) is checkbox-list-style, not chip-style — that gets *replaced* by `.dt-chip-grid` in dtui-20 (Court Acknowledge Peers)
- **`.dt-joint-invitee-grid`** (`components.css` and `downtime-form.js:4231-4245`) is also checkbox-list-style — that gets *replaced* by `.dt-chip-grid` in dtui-13
- **`.dt-feed-spec-chip`** (`components.css:3910-3925`) is closer to a chip but uses raw rgba colours — the new `.dt-chip` uses cleaner tokens

### What "pick from a roster" means

The component is for selecting one or more entities from a list of 5-30 labelled items. It is NOT for:

- "Pick one of few" (2-5 small options) — that's `.dt-ticker` (dtui-1)
- Free text entry
- Numeric input
- Hierarchical or nested selection

If the gesture is "click a labelled chip from a grid", `.dt-chip-grid` is the answer.

---

## Files in scope

- `public/css/components.css` — add `.dt-chip` + `.dt-chip-grid` component CSS at end of file or in a dedicated "Form components — DTUI" section. Include a usage comment block.
- `public/css/suite.css` — add the same rules for the parchment-light theme override if needed (verify by checking whether `.dt-npc-card` has parchment-specific overrides).

No JavaScript changes in this story. No HTML scaffold changes. Existing `.dt-npc-card`, `.dt-shoutout-item`, `.dt-joint-invitee-item`, `.dt-feed-spec-chip` are **not modified** — migrations happen in their respective consumer stories.

---

## Out of scope

- Migrating any existing consumer (NPC picker → dtui-21; Joint invitees → dtui-13; Court Acknowledge → dtui-20; etc.)
- Sort logic, filter logic, search logic — chip-grid is a render-only component; consumers handle their own data preparation
- Tooltip text content — consumers provide tooltips via the `title` attribute on disabled chips; this story defines how disabled chips display tooltips, not what the tooltip says
- Effective rating display semantics inside chips (e.g. "Allies ●●●") — that's a consumer-level concern handled in dtui-14 (sphere-merit chips)
- Drag-and-drop or reorder — not in scope for any DTUI story
- Search/filter inputs paired with chip grids — none of the consuming stories require this

---

## Acceptance Criteria

### AC1 — `.dt-chip-grid` renders a responsive grid of chips

**Given** a developer applies `.dt-chip-grid` to a `<div role="group" aria-labelledby="...">` containing `<button class="dt-chip">` children,
**When** the page renders in the existing TM Suite dark theme,
**Then** the chips display as a responsive grid that wraps at the container width using `flex-wrap: wrap` with comfortable gap (8-12px) between chips.

### AC2 — `.dt-chip` default visual state

**Given** a `.dt-chip` is rendered with no selection state,
**When** the user views it,
**Then** the chip shows: `var(--surf2)` background, `var(--bdr)` border, `var(--txt1)` label text, padded `8px 12px`, `5px` border-radius (rounded rectangle, not full pill), Lora font (`var(--ft)`) at 13px, with `cursor: pointer`.

### AC3 — `.dt-chip` hover state

**Given** the user hovers a non-disabled chip,
**When** the cursor is over it,
**Then** the chip border colour transitions to `var(--gold2)`; background lightens slightly to `var(--surf1)`.

### AC4 — `.dt-chip` selected state

**Given** a chip has the modifier class `.dt-chip--selected` applied,
**When** the chip renders,
**Then** the chip shows: `var(--gold2)` border, `var(--gold-a12)` background, optional small gold accent dot (●) prefix or no prefix per consumer choice. Default text colour stays `var(--txt1)` for legibility on the lightly-tinted background.

### AC5 — `.dt-chip` disabled state with tooltip

**Given** a chip has the `disabled` attribute (on `<button>`) or `aria-disabled="true"` plus a `title` attribute,
**When** the user hovers it,
**Then** the cursor shows `not-allowed`, opacity drops to 50-60%, AND the browser-native tooltip from the `title` attribute appears explaining why disabled. Disabled chips are NOT selectable on click (the underlying button is `disabled` so click handlers don't fire).

### AC6 — `.dt-chip` focus state

**Given** the user navigates with keyboard only,
**When** a chip receives focus,
**Then** the chip shows a 2px `var(--gold2)` outline (`outline: 2px solid var(--gold2); outline-offset: 2px;`), distinct from the selected state. Tab moves focus to the next chip in the grid; Shift-Tab moves backward.

### AC7 — `.dt-chip` optional state suffix

**Given** a chip needs to display a small suffix (e.g. "+3" for territory ambience state, "●●●" for merit dots),
**When** the chip is rendered with a `<span class="dt-chip__suffix">` after the main label,
**Then** the suffix appears in a smaller, muted style: 11px font, `var(--txt3)` colour, margin-left 6px, on the same line as the label.

### AC8 — Three grid variants documented

**Given** the `.dt-chip-grid` documentation comment block,
**When** a developer reads it,
**Then** three variants are documented with their semantic differences:
- `single-select`: exactly one chip selected at a time; clicking another deselects the first
- `multi-select`: any number of chips selected; clicking toggles each chip independently
- `single-select-required`: single-select with enforced selection (cannot deselect to zero)

The component CSS does not enforce these variants; consumers wire selection logic in JS. The CSS provides the visual states and the documentation establishes the contract.

### AC9 — Responsive grid behaviour

**Given** the form renders on a viewport at any width ≥1024px,
**When** the chip grid layout calculates,
**Then** chips use `flex-wrap: wrap` with `gap: 8-12px` and adapt to container width naturally. Specific column counts are NOT enforced by `.dt-chip-grid` itself — consumers wrap their `.dt-chip-grid` in their section's layout container which sets width constraints. (Wave 4 stories reference 4-col character / 6-col territory at ≥1280px, but those constraints come from the section's parent container, not from this component.)

### AC10 — Accessibility — screen reader compatibility

**Given** a screen reader (NVDA on Windows) reads the form,
**When** it encounters a `.dt-chip-grid`,
**Then** it announces the grid's `aria-labelledby` reference (the visible label/heading), then reads each chip's accessible name. Selected chips read with their selection state; disabled chips read with their tooltip text. Each chip's `role` (button, checkbox, or radio per consumer choice) is correctly announced.

### AC11 — Reduced motion compliance

**Given** the user has `prefers-reduced-motion: reduce` set,
**When** they interact with chips (hover, click, focus),
**Then** all colour/state transitions are instant — no `transition` animation. Static states function identically.

### AC12 — Token discipline

**Given** the new `.dt-chip` and `.dt-chip-grid` CSS rules are added,
**When** a `grep -E '#[0-9a-fA-F]{3,6}|rgb|rgba\(' public/css/components.css | grep -A 50 ".dt-chip"` is run,
**Then** zero bare hex codes or raw `rgba()` values appear in the `.dt-chip*` rule bodies. All colours go through CSS custom properties on `:root`.

### AC13 — Documentation comment block

**Given** the new component CSS section is added to `components.css`,
**When** a developer reads the file,
**Then** a comment block immediately above the rules documents:
- The intended use (pick from a roster of 5-30 labelled entities)
- The required HTML structure (container + chip children + optional suffix)
- The three grid variants and their selection semantics
- ARIA expectations: container `role="group"` + `aria-labelledby`; chip `role="button"|"checkbox"|"radio"` per variant
- A reference to migration stories that will adopt the component (dtui-8, dtui-11, dtui-13, dtui-14, dtui-16, dtui-20, dtui-21, dtui-23)

### AC14 — No regression in existing UI

**Given** the form renders before and after this story ships,
**When** the player views any current UI surface (NPC picker, Court shoutout, Joint invitees, feed spec chips),
**Then** no visible change. The new `.dt-chip*` rules do not collide with or override existing `.dt-npc-card*`, `.dt-shoutout*`, `.dt-joint-invitee*`, `.dt-feed-spec-chip*` classes.

---

## Implementation Notes

### CSS structure (proposed)

Add to `public/css/components.css` near the existing `.dt-npc-card` block (around line 3604) or in a dedicated "Form components — DTUI" section. Suggested placement: after the existing chip-like patterns, alongside the `.dt-ticker` from dtui-1.

```css
/* ════════════════════════════════════════════════════════════════════
   .dt-chip-grid + .dt-chip — chip grid for "pick from a roster"
   ────────────────────────────────────────────────────────────────────
   Canonical components for the "pick from a roster of 5-30 entities"
   gesture-shape used across the downtime form.

   Use for: targeting (Character/Territory chips), Joint invitees,
   sphere-merit collaborators, NPC correspondents, Maintenance items,
   Court Acknowledge Peers.

   Do NOT use for:
   - Picking one of a few (2-5 options) — use .dt-ticker instead
   - Multi-select where order matters or chips are draggable
   - Hierarchical or nested selection

   HTML structure:
   <div class="dt-chip-grid" role="group" aria-labelledby="my-grid-label">
     <h4 id="my-grid-label">Players</h4>
     <button class="dt-chip" type="button" data-id="alice">Alice Vunder</button>
     <button class="dt-chip dt-chip--selected" type="button" data-id="bob">
       Bob Smith
       <span class="dt-chip__suffix">+3</span>
     </button>
     <button class="dt-chip" type="button" disabled
             aria-disabled="true" title="No free projects this cycle">
       Charlie Doe
     </button>
   </div>

   Three variants (consumer-wired in JS):
   - single-select       — exactly one selected; clicking another deselects
   - multi-select        — any number selected; clicking toggles each
   - single-select-required — single-select but cannot deselect to zero

   The CSS provides visual states. Selection logic and ARIA roles
   (button/checkbox/radio per variant) are consumer responsibility.

   Adopted by stories: dtui-8, dtui-11, dtui-13, dtui-14, dtui-16,
   dtui-20, dtui-21, dtui-23
   ════════════════════════════════════════════════════════════════════ */

.dt-chip-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: stretch;
  margin-top: 4px;
}

.dt-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  color: var(--txt1);
  border-radius: 5px;
  font-family: var(--ft);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
  text-align: left;
  /* Comfortable touch target ≥ 32px height */
  min-height: 32px;
}

.dt-chip:hover {
  border-color: var(--gold2);
  background: var(--surf1);
}

.dt-chip--selected {
  border-color: var(--gold2);
  background: var(--gold-a12);
}

.dt-chip--selected:hover {
  background: var(--gold-a15);
}

.dt-chip:focus-visible {
  outline: 2px solid var(--gold2);
  outline-offset: 2px;
}

.dt-chip:disabled,
.dt-chip[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
  color: var(--txt3);
}

.dt-chip:disabled:hover,
.dt-chip[aria-disabled="true"]:hover {
  border-color: var(--bdr);
  background: var(--surf2);
}

/* Optional state suffix inside a chip (e.g. "+3", "●●●") */
.dt-chip__suffix {
  font-size: 11px;
  color: var(--txt3);
  margin-left: 2px;
  font-family: var(--fl);
  letter-spacing: .04em;
}

.dt-chip--selected .dt-chip__suffix {
  color: var(--gold2);
}

/* Add transitions only when reduced motion is not requested */
@media (prefers-reduced-motion: no-preference) {
  .dt-chip {
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
}
```

### Notes on the approach

- **`<button type="button">` for each chip.** Native button gives native keyboard behaviour (Enter/Space activate), focus management, and the `disabled` attribute. The `type="button"` prevents accidental form submission inside a `<form>`.
- **Variants are JS-wired, not CSS-enforced.** The CSS provides default/hover/selected/disabled visual states. Consumers determine click behaviour:
  - `single-select`: on click, remove `.dt-chip--selected` from siblings, add to clicked chip
  - `multi-select`: on click, toggle `.dt-chip--selected` on clicked chip
  - `single-select-required`: same as single-select but ignore clicks on the already-selected chip
- **ARIA roles per variant.** Consumers set role appropriately:
  - Multi-select: `role="checkbox"` + `aria-checked="true|false"`
  - Single-select: `role="radio"` + `aria-checked` + the parent gets `role="radiogroup"`
  - Or: simple `<button>` for opt-in actions with no traditional select semantics (e.g. "click to invite")
- **`aria-labelledby` on the parent.** Consumers wrap `.dt-chip-grid` in a container with a visible heading and reference it via `aria-labelledby`. The `<div class="dt-chip-grid" role="group">` with a sibling heading is the simplest pattern; more complex consumers can use `<fieldset>` + `<legend>`.
- **No fixed column count.** Letting flex-wrap handle wrapping naturally avoids brittle responsive breakpoints. Consumers that want specific column counts (e.g. dtui-13 player invitees at 4 columns) constrain `.dt-chip` width or `.dt-chip-grid` container width in their section CSS, not via this component.
- **`.dt-chip__suffix` for stateful labels.** The suffix slot lets territory chips show "+3", merit chips show "●●●", maintenance chips show "(maintained)". Suffix text is muted by default; on selected chips, the suffix takes the gold accent.

### Token reference

| Token | Defined at | Purpose |
|---|---|---|
| `--surf2` | `theme.css` | Default chip background |
| `--surf1` | `theme.css` | Hover chip background |
| `--bdr` | `theme.css` | Default chip border |
| `--gold2` | `theme.css` | Selected/hover/focus accent border + outline |
| `--gold-a12` | `theme.css` | Selected chip background tint |
| `--gold-a15` | `theme.css` | Selected chip hover background |
| `--ft` | `theme.css` | Lora font family for chip labels |
| `--fl` | `theme.css` | Cinzel for the suffix (matches existing convention for state indicators) |
| `--txt1` | `theme.css` | Default chip label text |
| `--txt3` | `theme.css` | Suffix text and disabled state text |

All tokens already exist on `:root`. No new tokens required.

### Parchment theme

Same approach as dtui-1: verify whether the parchment override (`reference_parchment_theme_overrides.md`) needs separate `.dt-chip*` rules in `suite.css`, or whether the existing token vocabulary works in both themes.

The existing `.dt-npc-card` block at `components.css:3604-3623` uses the same token vocabulary and renders correctly in both themes. The new `.dt-chip` follows that pattern, so it should work in both themes without separate parchment rules. **Verify by toggling the parchment theme during manual testing.**

### Testing approach

No automated test framework. Manual verification:

1. Add a temporary test rendering of `.dt-chip-grid` somewhere observable (test-downtime.html or a temporary block in the form)
2. Render at least 5 chips: one default, one selected, one disabled with title attribute, one with suffix, one focused
3. Verify states render correctly across viewports (1280px down to 1024px)
4. Test keyboard navigation (Tab between chips, Enter/Space to activate)
5. Test with NVDA: group label is announced, each chip's name reads, selected/disabled state reads, tooltip on disabled reads
6. Toggle parchment theme — chips render correctly in both
7. Toggle `prefers-reduced-motion: reduce` — transitions skip
8. Run grep for token discipline: `grep -E '#[0-9a-fA-F]{3,6}|rgba\(' public/css/components.css | grep -A 50 "dt-chip"` returns zero matches in `.dt-chip*` rule bodies

After verification, **remove the temporary test rendering**.

---

## Files Expected to Change

- `public/css/components.css` — add `.dt-chip-grid` + `.dt-chip` + `.dt-chip__suffix` component rules with documentation comment block (~110 lines)
- (Possibly) `public/css/suite.css` — if parchment override needs separate rules; verify during implementation

No JavaScript, no HTML, no schema, no API.

---

## Definition of Done

- All 14 ACs verified
- Manual verification across all states (default / hover / selected / disabled / focus / suffix)
- Keyboard navigation tested (Tab between chips, Enter/Space activate)
- NVDA announces grid label and each chip correctly
- Disabled chip tooltip reads on both hover and keyboard focus
- Parchment theme tested — chips render correctly
- Reduced-motion preference respected
- Token discipline grep returns zero bare hex/rgba in `.dt-chip*` rule bodies
- Documentation comment block in `components.css` lists 8 adopting stories
- No visual regression in existing UI (`.dt-npc-card`, `.dt-shoutout-item`, `.dt-joint-invitee-item`, `.dt-feed-spec-chip` all unchanged)
- `specs/stories/sprint-status.yaml` updated: `dtui-2-dt-chip-and-chip-grid: backlog → ready-for-dev → in-progress → review` as work proceeds
- Code review run; merge to dev when approved

---

## Compliance — cross-cutting rules

This story complies with the following cross-cutting compliance rules from `specs/epic-dtui-downtime-form-ux-refactor.md`:

- **CC3 — Greyed-with-reason rule:** Disabled chips show opacity drop AND `cursor: not-allowed` AND tooltip via `title` attribute. Verified by AC5.
- **CC4 — Token discipline:** Zero bare hex; only `:root` tokens. Verified by AC12.
- **CC6 — Accessibility baseline:** WCAG 2.1 AA, keyboard navigable, NVDA-compatible, `aria-labelledby`, visible focus states, ≥32px touch targets. Verified by AC6, AC10, plus `min-height: 32px` rule.
- **CC7 — Reduced motion support:** Animations wrapped in `@media (prefers-reduced-motion: no-preference)`. Verified by AC11.
- **CC9 — Component pattern library compliance:** `.dt-chip-grid` IS one of the canonical components. This story establishes the pattern.

CC1 (effective rating discipline), CC2 (filter-to-context), CC5 (British English copy), CC8 (no new modals) — not directly applicable to a foundation component story.

---

## Dependencies and Ordering

- **No dependencies.** Foundation atomic. Independent of dtui-1 (`.dt-ticker`) but typically shipped together as the foundation pair.
- **Unblocks:** dtui-8 (target scoping), dtui-11 (Maintenance target), dtui-13 (player invitees), dtui-14 (sphere-merit collaborators), dtui-16 (Allies Block target), dtui-20 (Court Acknowledge Peers), dtui-21 (Personal Story NPCs), dtui-23 (Feeding territory chips).
- **Recommended sequencing:** Land DTUI-1, DTUI-2, DTUI-3 in any order within Wave 1. They're independent. Wave 2 stories then consume both `.dt-ticker` and `.dt-chip-grid`.

---

## Sonnet-execution Notes

- **Single concern, single file (probably two).** Like dtui-1, this story is well-scoped.
- **Two related components in one story.** `.dt-chip` (atomic) and `.dt-chip-grid` (container) are tightly coupled — chips only exist inside grids — so they ship together. The proposed CSS treats them as one unit with one comment block.
- **Existing pattern to study first.** `.dt-npc-card` at `components.css:3604-3623` is the cleanest token-using prototype. Sonnet should read this section before writing the new component to ensure consistent token vocabulary and approach.
- **Selection logic is consumer-wired.** This story does NOT implement single-select / multi-select / single-select-required behaviour in JS. The component CSS provides visual states; consumers wire selection in their own JS. Document this clearly in the comment block (already done in the proposed CSS) so the next dev agent (CS for dtui-8 onwards) knows to wire selection per their needs.
- **No JS for this story.** Resist the temptation to build a JS helper module — premature abstraction. Each consumer knows its own selection rules; centralising too early would create a generic helper that doesn't fit any specific case well.

---

## Dev Agent Record

### Agent Model Used

(to be filled at implementation time)

### Completion Notes

(to be filled when implemented)

### File List

(to be filled when implemented)

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-2 story drafted by Bob; ready-for-dev. |
