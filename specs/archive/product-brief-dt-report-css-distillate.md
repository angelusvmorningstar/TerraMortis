---
title: "Product Brief Distillate: DT Report Dark-Native CSS"
type: llm-distillate
source: "product-brief-dt-report-css.md"
created: "2026-04-17"
purpose: "Token-efficient context for downstream story/implementation by dev agent"
---

# Distillate: DT Report Dark-Native CSS

## Context

- Game app = `index.html` + `suite.css`. Player portal = `player.html` + `player-layout.css`. These are SEPARATE products.
- The DT Report in the game app (`renderLatestReport()` in story-tab.js) loads story/proj-card CSS from suite.css — NOT player-layout.css.
- The Chronicle in player portal (`renderStoryTab()`) uses the same CSS classes but is NOT being changed. Any change to `.story-*` or `.proj-card-*` in suite.css affects only the game app.

## Rejected Ideas (do not re-propose)

- **Roll result at the top of the card**: Explicitly rejected by user. "I want Title, Fiction, Details." Card order is fixed: Header → narrative paragraph → mechanical details.
- **New wrapper component or section structure**: Not needed. `renderOutcomeWithCards()` already injects project cards immediately after their matching narrative section. Structure is correct.
- **Light mode / parchment aesthetic for game app**: Out of scope. Game app is always dark.
- **ST/player view mode toggle in game app**: Deferred to separate planning session. Do not implement here.
- **Any changes to player-layout.css**: Strictly out of scope. Player portal styling is intentionally separate.
- **Column-based layout or split panes**: Game app Downtime tab is single-column scroll. No layout restructuring.

## HTML Structure (renderOutcomeWithCards output)

```
.story-feed
  .story-entry
    .story-cycle-label          ← cycle name string (e.g. "Downtime Cycle 2")
    .story-narrative             ← wraps all parsed sections
      .story-section             ← per heading from parseOutcomeSections()
        h4.story-section-head   ← story beat title (e.g. "Party with Cyrus")
        <p>...</p>               ← narrative paragraphs
      .proj-card                 ← injected immediately after matching section
        .proj-card-header
          span.proj-card-type-chip   ← action type label (e.g. "Investigate")
          span.proj-card-name        ← project title
        .proj-card-objective [REMOVE from JS]
        .proj-card-pool
          .proj-card-pool-label  ← "POOL" label [hidden via CSS]
          .proj-card-pool-val    ← pool expression string
        .proj-card-roll[.proj-card-roll-exc|.proj-card-roll-fail]
        .proj-card-dice          ← dice result string
        .proj-card-feedback      ← ST note
          .proj-card-feedback-label
    [merit action .proj-card elements at bottom — same structure, no .proj-card-objective]
```

## Typography Rules (immutable constraints)

- `var(--fh)` = Cinzel — **only** `.story-cycle-label`. Never elsewhere in this view.
- `var(--fl)` = Lato — headings, labels, type chip, roll result, pool label
- `var(--ft)` = Libre Baskerville — narrative paragraphs (`<p>` in `.story-narrative`), ST note body (`.proj-card-feedback`), withheld message

## Key Design Decisions with Rationale

- **No surface backgrounds on cards**: `--surf2`/`--surf3` backgrounds create widget feel on dark. Dark page IS the container.
- **Left-border only on proj-card**: `3px solid var(--gold2)`. Signals "mechanical item" without boxing the content.
- **Cinzel for cycle label only**: Restraint earns authority. Cinzel everywhere = noise. Cinzel once = ritual marker.
- **Sentence case section headings**: Section titles are story beats written as narrative titles ("Party with Cyrus", "Letter from Home"). Uppercase treatment flattens them into utility labels. CSS change: remove `text-transform: uppercase`, remove `letter-spacing: .08em`.
- **Roll result prominent (16px bold)**: The mechanical outcome is what players scan for in a dark venue. Must be instantly readable from a glance.
- **Type chip as inline italic prefix, not badge**: Removes badge border/background chrome. Same information, far less visual noise.
- **Remove proj-card-objective from DOM**: Player's own project description restated in the report is redundant. They wrote it; they know it.
- **1.85 line-height**: Mobile reading in potentially dim conditions. Cramped lines are the primary legibility failure of the current design.

## Scope Signals

- **In scope**: suite.css `.story-*` and `.proj-card-*` blocks; story-tab.js (two targeted HTML output changes)
- **Out of scope**: player-layout.css; any server/API changes; any non-DT-report CSS; `renderStoryTab()` for player portal

## Open Questions (resolved during session)

- Card internal order: CONFIRMED as Title → Fiction → Details. No reorder.
- Pool + roll combined vs separate: CSS hides the "POOL" label; pool expression and roll result remain separate DOM elements but render as a vertical stack of de-emphasised → prominent, which achieves the reading goal without JS changes to combine them.
- Mechanical Outcomes section: `story-section-mech` class (shown as `<pre>`) — keep existing `--surf2` background treatment since it is intentionally differentiated monospace content. Not a narrative section.

## Files to Modify

1. `public/css/suite.css` — replace `.story-*` and `.proj-card-*` blocks
2. `public/js/player/story-tab.js` — remove `proj-card-objective` HTML emission (2 lines in `renderOutcomeWithCards`)

## Files NOT to Modify

- `public/css/player-layout.css`
- `public/css/theme.css`
- `server/` (no backend changes)
- Any other story-tab.js logic (section parsing, card injection, merit action cards)
