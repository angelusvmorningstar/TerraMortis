---
id: dtui.1
epic: dtui
status: ready-for-dev
priority: high
depends_on: []
---

# Story DTUI-1: `.dt-ticker` component (pill-ticker for "pick one of few")

As a player filling out the downtime form,
I want every "pick one of few" choice to use the same pill-ticker visual and interaction,
So that I learn the gesture once and reuse it without retraining for each section.

---

## Context

This is the first story in the **DTUI epic** — the player-facing downtime form UX refactor. The full UX design spec is at `specs/ux-design-downtime-form.md`; the epic breakdown is at `specs/epic-dtui-downtime-form-ux-refactor.md`.

DTUI-1 introduces `.dt-ticker` — a canonical pill-style selector for the "pick one of a few labelled options" gesture-shape. It does NOT migrate any existing consumers in this story. Migrations happen in subsequent waves:

- **Wave 2:** dtui-5 migrates Solo/Joint radios to `.dt-ticker`
- **Wave 4:** dtui-23 introduces three new tickers in the Feeding section (Territory, Blood Type, Method)
- **Wave 4:** dtui-24 renames Method labels (touches the migrated ticker)
- **Wave 2:** dtui-9 uses `.dt-ticker` for the Attack outcome (Destroy / Degrade / Disrupt)
- **Wave 2:** dtui-10 uses `.dt-ticker` for the Ambience Improve / Degrade direction

This story is **foundation only**: introduce the component class, document its API, ship it without changing any user-visible UI in the form. No regression risk — the component is added, not yet consumed.

### The pattern this generalises

The existing `.dt-feed-vi-btn` (Kiss / Violent toggle in the Feeding section) is the closest existing prototype:

- **CSS:** `public/css/components.css:3742-3766` — `.dt-feed-violence-toggle` wrapper + `.dt-feed-vi-btn` pills + `.dt-feed-vi-btn.dt-feed-vi-on` active state
- **JS render:** `public/js/tabs/downtime-form.js:5051-5062` — flexbox row of buttons with `data-feed-violence` attribute and `dt-feed-vi-on` class for active state

The existing pattern is already token-clean (`var(--surf2)`, `var(--bdr)`, `var(--gold2)`, `var(--bg)`, `var(--ft)`, `var(--txt2)`). The new `.dt-ticker` formalises this into a reusable, accessible component — adding fieldset/radiogroup ARIA semantics, keyboard navigation, disabled state with tooltip, and focus ring.

### What "pick one of few" means

The component is for selecting a single option from 2-5 labelled choices. It is NOT for:

- "Pick from a roster" (large lists of characters/territories) — that's `.dt-chip-grid` (dtui-2)
- Free text entry
- Numeric input
- Multi-select (multiple checkboxes)

If the gesture is "pick one of a few", `.dt-ticker` is the answer.

---

## Files in scope

- `public/css/components.css` — add `.dt-ticker` component CSS at end of file (or in a sensible place near the existing `.dt-feed-vi-btn` block at line 3742, but placed as a reusable section, not feed-specific). Include a usage comment block.
- `public/css/suite.css` — add the same `.dt-ticker` rules for the parchment-light theme override if needed (check whether the parchment override is needed — see "Parchment theme" note below).

No JavaScript changes in this story. No HTML scaffold changes. Existing `.dt-feed-vi-btn` is **not modified** — the migration happens later in dtui-24.

---

## Out of scope

- Migrating Solo/Joint radios (dtui-5 territory)
- Migrating Blood Type checkboxes (dtui-23 territory)
- Migrating the Kiss/Violent toggle (`.dt-feed-vi-btn`) (dtui-24 territory — also handles label rename)
- Adding tickers to the rote panel (dtui-25 territory)
- Attack outcome ticker (Destroy/Degrade/Disrupt) (dtui-9 territory)
- Ambience Improve/Degrade ticker (dtui-10 territory)
- Any consumer wiring — this story only introduces the component

---

## Acceptance Criteria

### AC1 — Component class exists and renders correctly

**Given** a developer applies `.dt-ticker` to a `<fieldset>` containing a `<legend>` and 2-5 labelled radio inputs styled as pills,
**When** the page renders in the existing TM Suite dark theme,
**Then** the fieldset displays as a horizontal row of pill-shaped buttons with rounded corners, label text only, no icons, equal-width pills with comfortable gap between them.

### AC2 — Default visual state

**Given** a `.dt-ticker` group is rendered with no pill selected,
**When** the user views the group,
**Then** each pill shows: `var(--surf2)` background, `var(--gold3)` text or `var(--txt2)`, subtle `var(--bdr)` border, `4px` border-radius, body Lora font (`var(--ft)`) at ~13-14px.

### AC3 — Active state when one pill is selected

**Given** a player or test harness selects one pill,
**When** the visual updates,
**Then** the selected pill shows: `var(--gold2)` background, `var(--bg)` text colour for contrast, `var(--gold2)` border, `font-weight: 600`. Other pills return to default state.

### AC4 — Hover state on non-selected pills

**Given** the user hovers a non-selected pill,
**When** the cursor is over the pill,
**Then** the pill shows: `var(--gold2)` border colour, `var(--gold2)` text. Background remains default until selected.

### AC5 — Disabled state with tooltip

**Given** a pill is in disabled state (via `disabled` attribute or `aria-disabled="true"` plus a `title` attribute),
**When** the user hovers it,
**Then** the cursor shows `not-allowed`, opacity drops to 50-60%, text uses `var(--surf-fg-muted)` or equivalent dim token, AND the browser-native tooltip from the `title` attribute appears explaining why. Disabled pills are NOT selectable on click.

### AC6 — Keyboard focus state

**Given** the user navigates with keyboard only (Tab key),
**When** focus enters the `.dt-ticker` group,
**Then** the focused pill shows a 2px `var(--gold2)` outline (`outline: 2px solid var(--gold2); outline-offset: 2px;` or equivalent), distinct from the active state. Arrow keys navigate within the group (radiogroup semantics). Tab moves focus out of the group to the next form control.

### AC7 — Accessibility — screen reader compatibility

**Given** a screen reader (NVDA on Windows) reads the form,
**When** it encounters a `.dt-ticker` group,
**Then** it announces the fieldset legend, identifies it as a radio group, then reads each pill's label with the selected state clearly identified ("selected" / "not selected"). Disabled pills' tooltip text reads on focus.

### AC8 — Reduced motion compliance

**Given** the user has `prefers-reduced-motion: reduce` set,
**When** they interact with the ticker (hover, click, focus),
**Then** all colour/state transitions are instant — no `transition` animation. The static states function identically.

### AC9 — Token discipline

**Given** the new `.dt-ticker` CSS rules are added,
**When** a `grep -E '#[0-9a-fA-F]{3,6}|rgb|rgba\(' public/css/components.css | grep -A 30 "dt-ticker"` is run,
**Then** zero bare hex codes or raw `rgba()` values appear in the `.dt-ticker` rule bodies. All colours go through CSS custom properties on `:root` (per `reference_css_token_system.md`).

### AC10 — Documentation comment block

**Given** the new `.dt-ticker` CSS section is added to `components.css`,
**When** a developer reads the file,
**Then** a comment block immediately above the rules documents:
- The intended use (pick one of few from 2-5 labelled options)
- The required HTML structure (fieldset + legend + radio inputs styled as pills)
- The expected attributes (`role="radiogroup"`, `aria-label` or visible legend)
- A reference to migration stories that will adopt the component (dtui-5, dtui-9, dtui-10, dtui-23, dtui-24, dtui-25)

### AC11 — No regression in existing UI

**Given** the form renders before and after this story ships,
**When** the player views the Feeding section with its existing `.dt-feed-vi-btn` Kiss/Violent toggle, and any other current UI surfaces,
**Then** no visible change — `.dt-feed-vi-btn` retains its current styling and behaviour. The `.dt-ticker` rules do not collide with or override existing classes.

---

## Implementation Notes

### CSS structure (proposed)

Add to `public/css/components.css` near the existing `.dt-feed-vi-btn` block (around line 3742) or in a dedicated "Form components — DTUI" section. Suggested placement: after the existing feeding components, before the next major section.

```css
/* ════════════════════════════════════════════════════════════════════
   .dt-ticker — pill-ticker for "pick one of few"
   ────────────────────────────────────────────────────────────────────
   Canonical selector for the "pick one of a few labelled options"
   gesture-shape used across the downtime form.

   Use for: 2-5 labelled options where the player picks exactly one.
   Examples: Solo/Joint, Method of Feeding, Attack outcome
   (Destroy/Degrade/Disrupt), Ambience direction (Improve/Degrade),
   Blood Type (Animal/Human/Kindred).

   Do NOT use for:
   - Picking from a roster (large lists) — use .dt-chip-grid instead
   - Multi-select — use checkboxes
   - Free text or numeric input

   HTML structure:
   <fieldset class="dt-ticker">
     <legend class="dt-ticker__legend">Method of Feeding</legend>
     <label class="dt-ticker__pill">
       <input type="radio" name="feed-method" value="kiss">
       <span>The Kiss (subtle)</span>
     </label>
     <label class="dt-ticker__pill">
       <input type="radio" name="feed-method" value="assault">
       <span>The Assault (violent)</span>
     </label>
   </fieldset>

   Adopted by stories: dtui-5, dtui-9, dtui-10, dtui-23, dtui-24, dtui-25
   ════════════════════════════════════════════════════════════════════ */

.dt-ticker {
  display: flex;
  gap: 8px;
  padding: 0;
  margin: 0;
  border: 0;
}

.dt-ticker__legend {
  font-family: var(--fl);
  font-size: 13px;
  color: var(--txt);
  margin-bottom: 6px;
  padding: 0;
  letter-spacing: .04em;
}

.dt-ticker__pill {
  flex: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 8px 14px;
  background: var(--surf2);
  border: 1px solid var(--bdr);
  color: var(--txt2);
  border-radius: 4px;
  font-family: var(--ft);
  font-size: 13px;
  cursor: pointer;
  user-select: none;
}

.dt-ticker__pill:hover {
  border-color: var(--gold2);
  color: var(--gold2);
}

.dt-ticker__pill:has(input:checked) {
  background: var(--gold2);
  border-color: var(--gold2);
  color: var(--bg);
  font-weight: 600;
}

.dt-ticker__pill:has(input:focus-visible),
.dt-ticker__pill:focus-within {
  outline: 2px solid var(--gold2);
  outline-offset: 2px;
}

.dt-ticker__pill:has(input:disabled),
.dt-ticker__pill[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
  color: var(--txt3);
}

.dt-ticker__pill:has(input:disabled):hover,
.dt-ticker__pill[aria-disabled="true"]:hover {
  border-color: var(--bdr);
  color: var(--txt3);
}

/* Hide the underlying radio input visually while keeping it accessible */
.dt-ticker__pill input[type="radio"] {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

/* Add transitions only when reduced motion is not requested */
@media (prefers-reduced-motion: no-preference) {
  .dt-ticker__pill {
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }
}
```

### Notes on the approach

- **`fieldset` + `legend` + radio inputs.** The semantic foundation. Browsers and assistive tech understand this natively as a radio group. The visible legend (or an `aria-label` on the fieldset if no visible legend is desired) names the group.
- **Visually-hidden radio inputs.** The radio inputs themselves are visually hidden (clip-path technique) but remain in the DOM, focused, keyboard-navigable, and announced by screen readers. The visible "pill" is the styled `<label>` wrapping the radio.
- **`:has(input:checked)` for active state.** Modern CSS — no JS needed for state styling. The label styles itself based on whether its child input is checked. Browser support: Chrome 105+, Firefox 121+, Safari 15.4+ (all current as of project's BAT-1280px+ desktop-only audience).
- **`:focus-within` fallback for older browsers** alongside `:has(:focus-visible)` for the modern path.
- **`aria-disabled="true"` for declarative disabled state.** Use the underlying `disabled` attribute on the radio when programmatically disabling. The CSS handles both forms.

### Token reference

| Token | Defined at | Purpose |
|---|---|---|
| `--surf2` | `theme.css` | Default pill background |
| `--bdr` | `theme.css` | Default pill border |
| `--gold2` | `theme.css` | Active pill background; hover/focus accent |
| `--bg` | `theme.css` | Active pill text colour (contrast on gold) |
| `--ft` | `theme.css` | Lora font family for body text |
| `--fl` | `theme.css` | Cinzel font family for the legend |
| `--txt2`, `--txt3` | `theme.css` | Default and muted text colours |

All tokens already exist on `:root`. No new tokens required for this story.

### Parchment theme

The form renders with the parchment-light theme override (`reference_parchment_theme_overrides.md` notes this). Verify whether the existing tokens work cleanly under the parchment override — they should, since the existing `.dt-feed-vi-btn` uses the same token vocabulary and renders correctly in parchment mode.

If the parchment override needs `.dt-ticker` rules in `suite.css` as well, copy the same rules there (or adjust the inheritance — check what the existing `.dt-feed-vi-btn` does in `suite.css` if it has a parchment-specific override).

### Testing approach

There is no automated test framework in this project (per `CLAUDE.md`). Manual verification is sufficient:

1. Add a temporary test rendering of `.dt-ticker` somewhere observable (e.g., a dev-only snippet in `test-downtime.html` or temporarily inserted into the form for visual inspection)
2. Verify all states render correctly (default, hover, active, disabled, focus)
3. Test keyboard navigation (Tab in / Arrow within / Tab out)
4. Test with NVDA: legend is announced, radio group is recognised, checked state reads
5. Test with `prefers-reduced-motion: reduce` (Chrome DevTools → Rendering panel)
6. Run a grep across the new rules: `grep -E '#[0-9a-fA-F]{3,6}|rgba\(|rgb\(' public/css/components.css | grep -A 30 ".dt-ticker"` should show zero matches inside `.dt-ticker__*` rules

After verification, **remove the temporary test rendering**. The component is shipped without a consumer; consumers are added in subsequent stories.

---

## Files Expected to Change

- `public/css/components.css` — add `.dt-ticker` component rules with documentation comment block (~80 lines)
- (Possibly) `public/css/suite.css` — if parchment override needs separate rules; verify during implementation

No JavaScript, no HTML, no schema, no API.

---

## Definition of Done

- All 11 ACs verified
- Manual verification across all states (default / hover / active / disabled / focus)
- Keyboard navigation tested (Tab, Arrow keys, Esc)
- NVDA announces the group correctly
- Reduced-motion preference respected
- Token discipline grep returns zero bare hex/rgba in `.dt-ticker__*` rule bodies
- Documentation comment block in `components.css` lists adopting stories (dtui-5, dtui-9, dtui-10, dtui-23, dtui-24, dtui-25)
- No visual regression in existing UI (Kiss/Violent toggle, Solo/Joint radios, Blood Type checkboxes — all unchanged)
- `specs/stories/sprint-status.yaml` updated: `dtui-1-dt-ticker-component: backlog → ready-for-dev → in-progress → review` as work proceeds
- Code review run; merge to dev when approved

---

## Compliance — cross-cutting rules

This story complies with the following cross-cutting compliance rules from `specs/epic-dtui-downtime-form-ux-refactor.md`:

- **CC4 — Token discipline:** Zero bare hex; only `:root` tokens. Verified by AC9.
- **CC5 — British English, no em-dashes:** No copy in this story (component-only); not applicable directly.
- **CC6 — Accessibility baseline:** WCAG 2.1 AA, keyboard navigable, NVDA-compatible, `aria-label`/legend, visible focus states. Verified by AC6, AC7.
- **CC7 — Reduced motion support:** Animations wrapped in `@media (prefers-reduced-motion: no-preference)`. Verified by AC8.
- **CC9 — Component pattern library compliance:** `.dt-ticker` IS one of the canonical components. This story establishes the pattern for it.

CC1 (effective rating discipline), CC2 (filter-to-context), CC3 (greyed-with-reason), CC8 (no new modals) — not applicable to a foundation component story.

---

## Dependencies and Ordering

- **No dependencies.** Foundation atomic.
- **Unblocks:** dtui-5 (Solo/Joint migration), dtui-9 (Attack outcome ticker), dtui-10 (Ambience Improve/Degrade), dtui-23 (three feeding tickers), dtui-24 (Method label rename — touches the migrated ticker), dtui-25 (rote panel selectors).
- **Recommended sequencing:** Land DTUI-1 first; verify the component renders correctly in isolation; THEN proceed to dtui-2 (chip-grid) and dtui-3 (action-desc) in the same wave; THEN move to Wave 2 stories that consume `.dt-ticker`.

---

## Sonnet-execution Notes

- **Single concern, single file (probably two).** This story is well-scoped for Sonnet execution.
- **Clear pattern reference.** The existing `.dt-feed-vi-btn` at `components.css:3742-3766` is the prototype to generalise. Sonnet should read that section first to understand the existing token usage and style approach.
- **No ambiguity in tokens.** All required tokens are listed in the Token Reference table above with their definition file location.
- **Testable visually.** Even without an automated test framework, the component states are observable via manual hover/click/focus. Sonnet should plan a small temporary HTML test rendering for verification, then remove before commit.

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
| 2026-04-29 | DTUI-1 story drafted by Bob; ready-for-dev. |
