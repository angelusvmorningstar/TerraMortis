# Story CSS-3: Port Missing CSS — Primer and Archive to suite.css

Status: review

## Story

As a user opening Primer or Archive from the More grid,
I want the content to render with correct styling,
So that these tabs look and feel like part of the same app rather than unstyled HTML.

## Background

`primer-tab.js` and `archive-tab.js` emit CSS classes that exist only in `player-layout.css`. The game app (`index.html`) loads `suite.css` — not `player-layout.css`. Both tabs currently render as bare browser defaults: blue hyperlinks, no layout, no spacing.

## Acceptance Criteria

1. **Given** a user opens Primer from the More grid **When** it renders **Then** the table of contents is styled (not blue browser-default links), and the content area has correct font and spacing
2. **Given** the Primer TOC **When** viewed on a phone **Then** it is not the primary focus — it collapses or flows naturally above content, not as a full-screen list of links
3. **Given** a user opens Archive from the More grid **When** it renders **Then** document cards, headings, and badges are styled consistently with the rest of the app
4. **Given** any styled element in Primer or Archive **When** inspected **Then** all colours use CSS tokens, all fonts follow the design system rules
5. **Given** parchment theme is active **Then** Primer and Archive render correctly in parchment

## Tasks / Subtasks

- [ ] Port Primer CSS to `suite.css` (AC: #1, #2, #4, #5)
  - [ ] Extract `.primer-*` rules from `player-layout.css` (around lines 3969–4024)
  - [ ] Audit each rule for token compliance (replace any hardcoded values)
  - [ ] Add to `suite.css` under `/* ── Primer tab (css-3) ── */`
  - [ ] Mobile behaviour: at ≤768px, TOC should stack ABOVE content, not side-by-side
  - [ ] TOC links: `var(--accent)` colour, `var(--fl)` font, NO default browser blue
  - [ ] Remove any `var(--rp-*)` tokens — replace with standard tokens
- [ ] Port Archive CSS to `suite.css` (AC: #3, #4, #5)
  - [ ] Extract `.arc-*` classes from `player-layout.css` (around lines 3161–3307)
  - [ ] Audit for token compliance
  - [ ] Add to `suite.css` under `/* ── Archive tab (css-3) ── */`
  - [ ] `.archive-badge` font: change from `var(--ft)` → `var(--fl)` (badge labels are Lato)
- [ ] Verify both tabs render correctly on 390px phone viewport (AC: #2)
- [ ] Verify parchment theme (AC: #5)
  - [ ] Load app in parchment mode, check both tabs

## Dev Notes

- `public/css/suite.css` — destination for all ported CSS
- `public/css/player-layout.css` — source: `.primer-*` around lines 3969–4024; `.arc-*` around lines 3161–3307
- Do NOT copy `player-layout.css` verbatim — audit each rule for token compliance first
- `.primer-toc` desktop layout is two-column (fixed sidebar + scrolling content). On mobile (≤768px) it must stack vertically — check the player-layout.css responsive block and port that too
- Sticky TOC: the desktop version has `position: sticky` on the TOC. On mobile this should not be sticky (takes up too much space)
- Parchment overrides: if any icon filters or SVG masks are used, add to the parchment block at end of suite.css

### References
- [Source: public/css/player-layout.css#3969] — Primer CSS source
- [Source: public/css/player-layout.css#3161] — Archive CSS source
- [Source: public/mockups/font-test.html] — token reference for compliance audit

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
