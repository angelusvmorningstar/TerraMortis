---
id: dtg.1
epic: downtime-game-app
group: A
status: complete
priority: high
---

# Story dtg.1: Downtime Form CSS — Extract to Shared Layer

As a player using the game app,
I want the downtime submission form to look and behave identically to the version in the player portal,
So that I'm not presented with an unstyled, broken form when submitting my downtime actions at the table.

## Background

The downtime submission form (`renderDowntimeTab` in `downtime-form.js`) is shared code used by both `player.html` and `index.html`. However the CSS that styles the form lives in `player-layout.css`, which is loaded by `player.html` only. `index.html` loads `theme.css`, `layout.css`, `components.css`, and `suite.css` — `player-layout.css` is absent from that stack.

The result: the form renders structurally in the game app but with no styling — raw browser default textareas, no section headers, no layout, no tokens applied.

The fix is to extract all downtime form component styles from `player-layout.css` into `components.css`, which is loaded by both apps. This is not a patch — it is the correct architectural home for shared form component styles. `player-layout.css` is a layout file and should not contain component-level rules.

### Design principles (from project CSS rules)

- CSS custom properties (`--bg`, `--surf*`, `--gold*`, `--accent`, `--txt*`) must be used throughout — no hardcoded hex values
- Typography: Lato for all UI labels/controls, Libre Baskerville for prose/body
- Cinzel restricted to character names and app branding only
- Accent token (`--accent`) is theme-aware — use it, never `--gold2` or `--crim` directly in shared files
- Zero visual regression on `player.html` is a hard requirement

## Acceptance Criteria

### Game App Form Appearance

**Given** a player opens the Downtime tab in the game app (`index.html`)
**When** the form renders
**Then** sections, questions, labels, textareas, selects, and buttons are styled identically to `player.html`

**Given** the form renders in the game app
**When** inspected
**Then** no CSS custom property tokens are undefined (no fallback-to-browser-default colours)

**Given** the form renders in the game app
**When** inspected
**Then** typography matches: Lato for labels/controls, Libre Baskerville for question body text and example prose

### Player Portal — Zero Regression

**Given** a player opens `player.html` after this change
**When** they view the Downtime tab
**Then** the form is visually identical to before — no layout shifts, no colour changes, no font changes

**Given** `player-layout.css` after this change
**When** inspected
**Then** it contains no downtime form component rules (only layout rules for the player portal shell: sidebar, tab panels, header)

### Token Compliance

**Given** the extracted CSS in `components.css`
**When** reviewed
**Then** all colour values use CSS custom property tokens, not hardcoded hex
**Then** all font references use `var(--fl)` (Lato), `var(--ft)` (Libre Baskerville), or `var(--fh)` (Cinzel — restricted use only)

## Scope

- Extract downtime form CSS from `public/css/player-layout.css` → `public/css/components.css`
- Classes in scope: all `.dt-*`, `.qf-*`, `.feeding-*`, `.regency-*`, `.dt-split`, `.dt-split-left`, `.dt-split-right`, `.dt-container`, `.reading-pane` (when used in downtime context), and any other classes used exclusively by `downtime-form.js` rendering
- Do not move layout-shell classes (sidebar, tab panel frames, header) — those stay in `player-layout.css`
- Do not add `player-layout.css` to `index.html` — that is not the solution

## Files

- `public/css/player-layout.css` — remove downtime component rules
- `public/css/components.css` — add extracted rules (append in a clearly labelled downtime section)
- No JS changes required
- No HTML changes required

## Dev Agent Record
### Agent Model Used
claude-sonnet-4-6
### Completion Notes
2026-04-20. Used Python extraction script to identify all downtime form component sections in player-layout.css (lines 777–2634, 2784–2969, 3309–3412, plus responsive and parchment overrides). Extracted 2148 lines to a clearly labelled section appended to components.css. Removed extracted blocks from player-layout.css (2214 lines removed, file reduced from 4271 to 2060 lines), replaced with stub comments. All key classes verified: .qf-section-title, .dt-split, .feeding-method-label, .regency-title now in components.css and absent from player-layout.css.
### File List
- public/css/components.css
- public/css/player-layout.css
