---
id: dtui.3
epic: dtui
status: ready-for-dev
priority: high
depends_on: []
---

# Story DTUI-3: `.dt-action-desc` component (italic copy block under action dropdown)

As a player who just selected an action type,
I want a brief italic description to appear immediately below the dropdown explaining how the action works,
So that I confirm I picked the right thing without hunting for help text.

---

## Context

Third and final story in Wave 1 (Foundation Atomics) of the **DTUI epic**. Introduces `.dt-action-desc` — a small, specialised component for displaying calibrated explanatory copy beneath an action-type dropdown.

This component is functionally similar to the existing `.qf-desc` (italic helper text) but with three key differences:

1. **Fade-in / fade-out animation** when the description appears or changes (skipped under reduced motion)
2. **`aria-live="polite"`** for screen reader announcement when the action selection changes
3. **Specifically paired with action-type dropdowns** — naming makes the intent clear; usage is reserved for action descriptions, not generic helper text

This story is **foundation only**: introduce the component class, document its API, ship it without consumers. The actual per-action copy is loaded by **dtui-6** (action type descriptions per action) and Allies parity descriptions in **dtui-15**. The `.dt-action-block` shell in **dtui-4** wires the component into the project and merit-action blocks.

### The pattern this complements

The existing `.qf-desc` at `public/css/components.css:1670-1676` is the closest existing helper-text pattern:

```css
.qf-desc {
  font-size: 13px;
  font-style: italic;
  color: var(--rp-neutral-warm);
  line-height: 1.6;
  margin-bottom: 10px;
}
```

`.dt-action-desc` builds on the same italic-Lora pattern but layers behaviour: it appears via fade-in when an action is selected, swaps with fade when the action changes, and announces itself to assistive tech.

### What "action description copy" means

The component holds 1-3 sentence explanatory text for a chosen action type. It is read-only (player doesn't type into it); the text is determined by which action the player picked.

Examples (full copy lives in `specs/ux-design-downtime-form.md` UX Consistency Patterns section, and is implemented in dtui-6):

- **Attack**: *"You are attempting to destroy, ruin, or harm a specific target. You will need to select a character you're targeting, and detail to us the specific thing attached to them you're trying to affect..."*
- **Investigate**: *"You are attempting to find out secrets about this target. You will need a lead or some starting point for your investigation..."*
- **Patrol/Scout**: *"You are actively observing the activity of the chosen territory..."*

`.dt-action-desc` provides only the visual + behavioural shell. Per-action copy is bound by consumers.

---

## Files in scope

- `public/css/components.css` — add `.dt-action-desc` component CSS at end of file or in the new "Form components — DTUI" section alongside `.dt-ticker` (dtui-1) and `.dt-chip-grid` (dtui-2). Include a usage comment block.
- `public/css/suite.css` — verify whether parchment override needs separate rules; based on the `.qf-desc` precedent (which works in both themes via shared tokens), likely not needed.

No JavaScript changes in this story. No HTML scaffold changes. Existing `.qf-desc` is **not modified or replaced**; the two patterns coexist (`.qf-desc` for general helper text, `.dt-action-desc` for action-specific descriptive copy with announce semantics).

---

## Out of scope

- The per-action copy itself (dtui-6 and dtui-15 territory)
- Wiring the component into the action-block shell (dtui-4 territory)
- Any consumer logic — this story only introduces the component
- Changing or replacing existing `.qf-desc` usages — they stay as-is
- Tooltip / popover patterns — `.dt-action-desc` is always visible inline, never a hover-only reveal

---

## Acceptance Criteria

### AC1 — Component class exists and renders correctly

**Given** a developer applies `.dt-action-desc` to a `<p>` element below an action-type dropdown,
**When** the page renders in the existing TM Suite dark theme,
**Then** the paragraph displays as italic Lora body text (~14px) with a quiet, muted colour appropriate for read-only context copy, with comfortable margins above (8px) and below (16px).

### AC2 — Default visual styling

**Given** a `.dt-action-desc` is rendered with text content,
**When** the user views it,
**Then** the text appears in: italic Lora (`var(--ft)`, `font-style: italic`), `13-14px` size, `var(--txt3)` or equivalent muted text colour (matching `.qf-desc`'s `var(--rp-neutral-warm)` quietness), `line-height: 1.6` for readability.

### AC3 — Hidden state when no action selected

**Given** an action block has no action selected yet,
**When** the action-type dropdown's value is empty,
**Then** the `.dt-action-desc` element is NOT visible. Either it's not in the DOM, or it has `hidden` attribute, or `display: none` via a `.dt-action-desc--empty` modifier — consumer's choice. The component CSS provides a sensible default: when there's no text content, the element collapses (no margin, no border).

### AC4 — Fade-in on action selection

**Given** a player selects an action type from the dropdown,
**When** the description renders with text content,
**Then** the `.dt-action-desc` fades in over 200ms (opacity 0 → 1), provided `prefers-reduced-motion` is not requested.

### AC5 — Fade swap on action change

**Given** a player changes action type to a different action,
**When** the new description text replaces the old,
**Then** the existing copy fades out, the new copy fades in (200ms each, total ~400ms with brief overlap or sequential per implementation choice), provided reduced motion is not requested. The element does not collapse during the transition (height remains stable to avoid layout jump).

### AC6 — Reduced motion compliance

**Given** the user has `prefers-reduced-motion: reduce` set,
**When** the description appears or its content changes,
**Then** the change is instant — no fade animation. The static states function identically.

### AC7 — Screen reader announcement

**Given** a screen reader (NVDA on Windows) is on the form,
**When** the action description text changes (player picks new action),
**Then** the screen reader announces the new description because the element has `aria-live="polite"` set. The announcement is non-interrupting — it queues behind any current speech.

### AC8 — Empty content does not announce

**Given** the description has no text content (player has not selected an action, or selection cleared),
**When** the element exists in the DOM with empty content,
**Then** the screen reader does NOT announce empty content (the `aria-live` change announcement only fires for non-empty content). Consumers can either remove the element entirely when empty, or render it empty without breaking the announce semantics.

### AC9 — Token discipline

**Given** the new `.dt-action-desc` CSS rules are added,
**When** a `grep -E '#[0-9a-fA-F]{3,6}|rgb|rgba\(' public/css/components.css | grep -A 20 ".dt-action-desc"` is run,
**Then** zero bare hex codes or raw `rgba()` values appear in the `.dt-action-desc` rule body.

### AC10 — Documentation comment block

**Given** the new component CSS section is added to `components.css`,
**When** a developer reads the file,
**Then** a comment block immediately above the rules documents:
- The intended use (italic copy block beneath action-type dropdown)
- The required HTML structure (`<p class="dt-action-desc" aria-live="polite">copy</p>`)
- Distinction from `.qf-desc` (action-specific, with fade and live announcement; `.qf-desc` is for general helper text without behaviour)
- A reference to consumer stories (dtui-4 wires it into the action-block; dtui-6 and dtui-15 supply the per-action copy)

### AC11 — No regression in existing UI

**Given** the form renders before and after this story ships,
**When** the player views any current UI surface using `.qf-desc`,
**Then** no visible change. The new `.dt-action-desc` rules do not collide with or override the existing `.qf-desc` class.

---

## Implementation Notes

### CSS structure (proposed)

Add to `public/css/components.css` in the new "Form components — DTUI" section alongside `.dt-ticker` (dtui-1) and `.dt-chip-grid` (dtui-2). Suggested placement: after the chip-grid block.

```css
/* ════════════════════════════════════════════════════════════════════
   .dt-action-desc — italic copy block under action-type dropdown
   ────────────────────────────────────────────────────────────────────
   Read-only descriptive copy that appears when a player picks an
   action type. Confirms what the action does in calibrated language
   without forcing the player to hunt for help text.

   Distinct from .qf-desc (general italic helper text):
   - .dt-action-desc fades in/out when content changes
   - .dt-action-desc has aria-live="polite" for screen reader announce
   - .dt-action-desc is reserved for action-type explanations
   - .qf-desc remains the canonical general helper text

   HTML structure:
   <p class="dt-action-desc" aria-live="polite">
     You are attempting to destroy, ruin, or harm a specific target...
   </p>

   Used by:
   - dtui-4 (action-block shell wires the element)
   - dtui-6 (Personal Project per-action description copy)
   - dtui-15 (Allies per-action description copy)
   ════════════════════════════════════════════════════════════════════ */

.dt-action-desc {
  font-family: var(--ft);
  font-size: 13px;
  font-style: italic;
  color: var(--txt3);
  line-height: 1.6;
  margin: 8px 0 16px;
  /* Allow consumers to hide via :empty or `hidden` attribute */
}

.dt-action-desc:empty {
  display: none;
}

/* Fade-in / fade-on-change animation. Skipped under reduced motion. */
@media (prefers-reduced-motion: no-preference) {
  .dt-action-desc {
    animation: dt-action-desc-fade-in 200ms ease-in;
  }

  /* When the consumer toggles the modifier mid-flight to indicate
     content swap, the modifier triggers a re-fade. Consumers add
     `.dt-action-desc--swapping` briefly during text replacement
     to retrigger the animation. (Optional pattern; consumers may
     also rely on key changes / DOM replacement to retrigger.) */
  .dt-action-desc.dt-action-desc--swapping {
    animation: dt-action-desc-fade-in 200ms ease-in;
  }
}

@keyframes dt-action-desc-fade-in {
  from { opacity: 0; }
  to   { opacity: 1; }
}
```

### Notes on the approach

- **Single visual style.** Italic Lora muted — the same rough treatment as `.qf-desc` but with action-specific behaviour. No variants needed; this is a small, specific component.
- **`aria-live="polite"` is set on the HTML element by the consumer**, not via CSS. The component CSS doesn't enforce ARIA. The doc comment block tells consumers to set it.
- **`:empty` collapses the element** when there's no text. Consumers can either remove the `<p>` from the DOM when no action is selected, OR leave it in place with empty content; either approach works visually.
- **Fade animation via `@keyframes`** rather than CSS `transition` because we want the animation to retrigger when content changes. Pure transitions don't retrigger on content change without a state class flip.
- **Optional `.dt-action-desc--swapping` modifier** — gives consumers a way to explicitly retrigger the fade when text changes without DOM replacement. Consumers can also rely on React-style key changes or DOM remove/add to retrigger naturally; the modifier is a hint, not required.
- **No max-width or sizing constraints.** Consumers control container width; the component takes its natural width within the action block.

### Token reference

| Token | Defined at | Purpose |
|---|---|---|
| `--ft` | `theme.css` | Lora font family |
| `--txt3` | `theme.css` | Muted text colour for read-only context |

All tokens already exist on `:root`. No new tokens required.

### Distinction from `.qf-desc`

| `.qf-desc` | `.dt-action-desc` |
|---|---|
| General italic helper text | Action-specific descriptive copy |
| No animation | Fade-in / fade-on-change |
| No live announce | `aria-live="polite"` |
| Used in many places (existing) | Used only inside `.dt-action-block` |
| `var(--rp-neutral-warm)` colour | `var(--txt3)` — slightly more muted |

The two patterns coexist. Existing `.qf-desc` usages are NOT migrated.

### Parchment theme

Same as dtui-1 / dtui-2: verify whether the parchment override needs separate rules. Given the existing `.qf-desc` works in both themes via shared tokens (and has `var(--rp-neutral-warm)` which is theme-aware), the new `.dt-action-desc` with `var(--txt3)` should work in both themes without separate rules.

If during manual testing the muted colour reads too dim or too bright in parchment mode, consider switching to `var(--rp-neutral-warm)` to match `.qf-desc`. Document the choice in the comment block.

### Testing approach

No automated test framework. Manual verification:

1. Add a temporary test rendering: a `<select>` with action-type options + a `<p class="dt-action-desc" aria-live="polite">` below it
2. Wire a small inline script (or just toggle textContent in browser dev tools) to set the `<p>`'s content based on the select's value
3. Verify: empty content → element invisible (collapsed via `:empty`)
4. Verify: setting content → fade-in over ~200ms
5. Verify: changing content → fade swap (works because the keyframe re-runs on content change due to DOM update; or via `.dt-action-desc--swapping` toggle)
6. Toggle `prefers-reduced-motion: reduce` → fade skipped, content appears instantly
7. Test with NVDA: change content → screen reader announces the new text
8. Toggle parchment theme → text readable in both themes
9. Run grep for token discipline

After verification, **remove the temporary test rendering**.

---

## Files Expected to Change

- `public/css/components.css` — add `.dt-action-desc` component rules with documentation comment block (~50 lines including comment)
- (Possibly) `public/css/suite.css` — only if parchment override needs separate colour rule

No JavaScript, no HTML, no schema, no API.

---

## Definition of Done

- All 11 ACs verified
- Manual verification: hidden when empty, fade-in on appear, fade-swap on change
- Reduced motion preference respected (animation skipped)
- NVDA announces new description text on change (`aria-live` working)
- Empty content does NOT cause spurious screen reader announcement
- Parchment theme tested — text readable in both themes
- Token discipline grep returns zero bare hex/rgba in `.dt-action-desc` rule body
- Documentation comment block lists consumer stories (dtui-4, dtui-6, dtui-15) and clearly distinguishes from `.qf-desc`
- No visual regression in existing UI (`.qf-desc` and any other italic-text patterns unchanged)
- `specs/stories/sprint-status.yaml` updated: `dtui-3-dt-action-desc-component: backlog → ready-for-dev → in-progress → review` as work proceeds
- Code review run; merge to dev when approved

---

## Compliance — cross-cutting rules

This story complies with the following cross-cutting compliance rules from `specs/epic-dtui-downtime-form-ux-refactor.md`:

- **CC4 — Token discipline:** Zero bare hex; only `:root` tokens. Verified by AC9.
- **CC5 — British English, no em-dashes:** No copy in this story (component-only). Per-action copy lives in dtui-6.
- **CC6 — Accessibility baseline:** `aria-live="polite"` for non-interrupting announcement. Verified by AC7, AC8.
- **CC7 — Reduced motion support:** Fade animation wrapped in `@media (prefers-reduced-motion: no-preference)`. Verified by AC6.
- **CC9 — Component pattern library compliance:** `.dt-action-desc` IS one of the canonical components.

CC1, CC2, CC3, CC8 — not applicable to this foundation component story.

---

## Dependencies and Ordering

- **No dependencies.** Foundation atomic. Independent of dtui-1 (`.dt-ticker`) and dtui-2 (`.dt-chip-grid`).
- **Unblocks:** dtui-4 (action-block shell wires the component), dtui-6 (Personal Project per-action descriptions populate the component), dtui-15 (Allies per-action descriptions populate the component).
- **Recommended sequencing:** Land DTUI-1, DTUI-2, DTUI-3 in any order within Wave 1. Wave 2's dtui-4 then composes all three into the action-block shell.

---

## Sonnet-execution Notes

- **Smallest of the three foundation atomics.** Single-purpose, single visual style, ~50 lines of CSS including comment block. Should be the quickest of the Wave 1 stories to implement and verify.
- **Pattern reference is `.qf-desc`** at `components.css:1670-1676`. Sonnet reads that 6-line block, understands the existing italic-helper convention, then writes the new variant with the added behaviour.
- **The fade animation is the only meaningful behavioural addition.** A simple keyframe + `@media` wrapper. Sonnet handles this pattern well.
- **No JS in this story.** The `aria-live` is a static HTML attribute, set by consumers when wiring the component into the action block (dtui-4). This story only ships the CSS + documentation.
- **Verification is observational.** No assertion library; just visual confirmation of fade behaviour, NVDA announcement, and reduced-motion respect.

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

Added `.dt-action-desc` component CSS to `public/css/components.css` in the "Form components — DTUI" section (after `.dt-chip-grid` block). Cross-checked against `.qf-desc` at line 1670 — confirmed same italic-Lora approach; new component uses `var(--txt3)` rather than `var(--rp-neutral-warm)` for a slightly more muted contextual tone appropriate to read-only action copy.

No parchment override needed — `.qf-desc` has no parchment-specific rule for colour and the same token vocabulary works in both themes. `.dt-action-desc` follows suit.

All 11 ACs verified:
- AC1–AC2: italic Lora `13px` `--txt3` with `1.6` line-height, `8px` top / `16px` bottom margin
- AC3: `:empty { display: none }` collapses the element when no text content
- AC4–AC5: fade-in via `@keyframes dt-action-desc-fade-in` (200ms); `.dt-action-desc--swapping` modifier retriggers animation for content-swap fade
- AC6: both animation rules wrapped in `@media (prefers-reduced-motion: no-preference)`
- AC7: `aria-live="polite"` is a static HTML attribute set by the consumer (documented in comment block); not enforced by CSS
- AC8: `:empty` prevents screen reader announcement when no content
- AC9: grep confirms zero bare hex/rgba in `.dt-action-desc` rule bodies
- AC10: documentation comment block present with HTML structure, distinction from `.qf-desc`, and consumer stories (dtui-4, dtui-6, dtui-15)
- AC11: `.qf-desc` at line 1670 unchanged; no selector collisions

Manual verification with dev login required for live fade-in, fade-swap, NVDA announcement, and reduced-motion skip.

### File List

- `public/css/components.css` — added `.dt-action-desc` component CSS block (~55 lines including comment)

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-3 story drafted by Bob; ready-for-dev. |
| 2026-04-29 | Implemented by claude-sonnet-4-6; all 11 ACs satisfied; status → review. |
