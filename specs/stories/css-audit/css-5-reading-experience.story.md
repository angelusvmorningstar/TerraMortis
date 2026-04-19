# Story CSS-5: Reading Experience — DT Report and Primer for Mobile

Status: review

## Story

As a player reading their downtime narrative on a phone,
I want the text to be comfortable to read with clear hierarchy and no layout breakage,
So that the narrative moment lands properly rather than feeling like a web form.

## Background

The DT Report (Chronicle) and Primer are both reading-heavy screens. Both were designed with a two-pane desktop layout (ToC/navigation on the left, content on the right). On a phone this collapses badly. The Primer ToC currently takes up the entire screen. The DT Report has inconsistent padding and the two-pane layout doesn't adapt.

This story is about the *experience* of reading — typography scale, line length, spacing, and layout — not just fixing bugs.

## Acceptance Criteria

1. **Given** a player opens DT Report on a 390px phone **When** the narrative renders **Then** prose is readable: `var(--ft)` Libre Baskerville at 14–15px, line-height ≥1.6, outer padding ≥16px, max line length capped (max-width ~600px or content constraint)
2. **Given** the DT Report has a left "Chronicle" panel **When** on mobile **Then** that panel does NOT take horizontal space — it either collapses to a heading above content, or is hidden in favour of the narrative
3. **Given** section headings within a downtime narrative (project titles, action outcomes) **When** rendered **Then** they are visually distinct from prose — clear weight difference, appropriate spacing
4. **Given** a player opens Primer on a phone **When** it first renders **Then** the TOC is NOT the first full-screen experience — the content appears first or the TOC is a compact collapsed component
5. **Given** Primer content **When** rendered **Then** headings use `var(--fh)` (Cinzel) for chapter titles, `var(--fl)` (Lato) for section titles — matching the document's intended hierarchy

## Tasks / Subtasks

- [ ] DT Report mobile layout (AC: #1, #2)
  - [ ] Find where `.story-split` or equivalent two-pane layout is defined in `player-layout.css`
  - [ ] At ≤768px: collapse left Chronicle panel — it becomes a `<h2>` heading above the narrative, not a sidebar
  - [ ] Add outer padding (16px sides) to the narrative content area
  - [ ] Ensure line-height ≥1.6 on prose elements
  - [ ] Port mobile-specific rules to `suite.css`
- [ ] DT Report section hierarchy (AC: #3)
  - [ ] Check how project titles and action section headings are styled — ensure they stand out from prose
  - [ ] Use `var(--fl)` small-caps for section headings within narrative (not Cinzel)
- [ ] Primer TOC mobile behaviour (AC: #4)
  - [ ] At ≤768px: TOC section stacks above content (already noted in CSS-3)
  - [ ] TOC should be scrollable horizontally or collapsible — not a wall of links taking the full screen
  - [ ] Consider a "jump to section" collapsed approach rather than always-visible full TOC
- [ ] Primer heading hierarchy (AC: #5)
  - [ ] Chapter/major headings (h1, h2 in primer content): `var(--fh)` Cinzel is appropriate
  - [ ] Sub-section headings (h3, h4): `var(--fl)` Lato uppercase
  - [ ] Prose: `var(--ft)` Libre Baskerville
  - [ ] Verify primer-tab.js headings match this hierarchy

## Dev Notes

- `public/css/suite.css` — add mobile layout rules here
- `public/js/player/story-tab.js` — DT Report renderer; check what CSS classes it emits for the two-pane layout
- `public/js/player/primer-tab.js` — check how TOC is generated; may need JS change to make it collapsible
- This story is partially UX/design, not just CSS — the TOC collapsible behaviour may require a small JS change
- **Do not redesign the content** — only improve the layout and typography for mobile readability
- Reference: `public/mockups/font-test.html` panels 1–3 show the reading experience target

### References
- [Source: public/js/player/story-tab.js] — DT Report renderer
- [Source: public/js/player/primer-tab.js] — Primer renderer
- [Source: public/mockups/font-test.html] — reading panel patterns

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
