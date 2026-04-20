# Story CSS-1: Token Cleanup — Define Missing Tokens, Remove Hardcoded Colours

Status: review

## Story

As a developer maintaining the game app,
I want all CSS to use the established token system with no undefined variables or hardcoded values,
So that the app adapts correctly to both dark and parchment themes and is maintainable.

## Background

The CSS audit identified undefined tokens being silently referenced (elements using them render incorrectly) and hardcoded colour values that won't adapt when the user switches themes.

## Acceptance Criteria

1. **Given** any component in the game app **When** parchment theme is active **Then** no element shows an incorrect colour from a hardcoded hex or undefined token
2. **Given** `suite.css` is inspected **When** searched for undefined tokens **Then** `var(--green3)`, `var(--err4-a95)`, `var(--err4-a9)`, `var(--green-a45)`, `var(--green4-a15)`, `var(--green5-a35)`, `var(--green3-a9)`, `var(--green3-a5)` are either defined or replaced with correct existing tokens
3. **Given** `player-layout.css` feeding section is inspected **Then** `var(--rp-surf)`, `var(--rp-head)`, `var(--rp-txt)` are replaced with suite tokens
4. **Given** `suite.css` is inspected **When** searched for hardcoded colours **Then** `#000`, `#fff`, raw hex and rgba values are replaced with tokens
5. **Given** `var(--fb)` appears in `suite.css` **Then** it is replaced with `var(--ft)` (Libre Baskerville — `--fb` does not exist in the design system)

## Tasks / Subtasks

- [ ] Audit all undefined tokens in `suite.css` (AC: #2)
  - [ ] `var(--green3)` → replace with `var(--green-dk)` or define in `theme.css`
  - [ ] `var(--err4-a95)`, `var(--err4-a9)` → replace with `var(--crim)` / `var(--crim-a8)` equivalents
  - [ ] `var(--green-a45)`, `var(--green4-a15)`, `var(--green5-a35)`, `var(--green3-a9)`, `var(--green3-a5)` → replace with `var(--green-dk-bg)`, `var(--green-dk-bdr)` equivalents from design system
- [ ] Fix reading pane tokens in feeding CSS (AC: #3)
  - [ ] `var(--rp-surf)` → `var(--surf2)`
  - [ ] `var(--rp-head)` → `var(--accent)`
  - [ ] `var(--rp-txt)` → `var(--txt2)`
  - [ ] Search `suite.css` for all `--rp-*` usages and replace
- [ ] Remove hardcoded colours (AC: #4)
  - [ ] `suite.css:1092` `.city-map-wrap { background: #000 }` → `var(--bg)`
  - [ ] `suite.css` `.cr-roll-btn { color: #fff }` → `var(--txt)` or `#fff` if intentional contrast (document reason)
  - [ ] `suite.css` `.login-crim-btn { color: #fff }` → same
  - [ ] Feeding CSS: `color: #6A5A4A` → `var(--txt3)`; `color: #8A7A6A` → `var(--txt3)`
  - [ ] Ticket badge colours (rgba + hex in player-layout.css lines 4049–4056) → define semantic ticket status tokens or use existing status tokens
- [ ] Fix `var(--fb)` → `var(--ft)` (AC: #5)
  - [ ] Search `suite.css` for all `--fb` usages and replace with `--ft`

## Dev Notes

- `public/css/suite.css` — primary file for changes
- `public/css/player-layout.css` — feeding section (--rp-* tokens) and ticket badges
- `public/css/theme.css` — define any new tokens here under both `:root` and `[data-theme="dark"]`
- Design system reference: `public/mockups/font-test.html` — canonical token list
- Do NOT introduce new tokens for one-off use cases — map to existing tokens

### References
- [Source: public/mockups/font-test.html] — token definitions
- Audit findings: `var(--green3)` at suite.css:1170; `var(--err4-a95)` at suite.css:418,424,427,441,443

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
