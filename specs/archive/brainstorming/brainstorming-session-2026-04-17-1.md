---
stepsCompleted: [1, 2, 3, 4]
workflow_completed: true
ideas_generated: 20
inputDocuments: []
session_topic: 'Dark-native CSS design for the DT Report tab in the Terra Mortis game app'
session_goals: 'Design a reading experience for downtime narrative reports that feels atmospheric and intentional for a mobile/tablet dark-theme LARP table app'
selected_approach: 'ai-recommended'
techniques_used: ['Alien Anthropologist', 'Metaphor Mapping', 'SCAMPER Method']
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Angelus
**Date:** 2026-04-17

## Session Overview

**Topic:** Dark-native CSS design for the DT Report tab in the Terra Mortis game app

**Goals:** Generate visual design ideas for a downtime narrative reading experience that:
- Feels atmospheric and intentional on dark backgrounds
- Works for mobile/tablet at a live LARP table (potentially dim lighting)
- Does NOT feel like ported player portal CSS
- Serves the key elements: narrative text, section headings, project action cards, cycle label banner, and roll result badges

### Session Setup

Fresh session — no prior brainstorming files found.

---

## Technique Selection

**Approach:** AI-Recommended
**Techniques:** Alien Anthropologist → Metaphor Mapping → SCAMPER Method

**AI Rationale:** Visual/UX design challenge with strong subjective dimension. Alien Anthropologist to shed the ported-CSS mental model. Metaphor Mapping to find the right atmospheric direction. SCAMPER to convert direction into specific CSS decisions.

---

## Key Insights from Alien Anthropologist

**The Two Modes:** The DT report must serve two genuinely different jobs:
1. **Pre-game reading** — player on phone in transit, mentally transitioning into character. Immersive. Comfortable pace. Mood-setting ritual.
2. **At-game quick reference** — dark venue, 10-second glance, "what was the outcome of my Resources action?"

These have partially conflicting requirements — the design must honour both.

**Mood Transition:** Reading the DT report is a threshold ritual. The design should feel like crossing into the game world, not opening a work document.

**Screen Context:** Phone screen, varying light, no guarantee of stillness. Legibility is non-negotiable. Atmosphere must come from restraint, not decoration.

---

## Key Insights from Metaphor Mapping

**The Playbill/Letter Hybrid:**
- Outer structure = theatre programme (playbill). The cycle label is the title card — "what night this is."
- Inner content = correspondence. Sections are evocative story beat titles ("Party with Cyrus", "Letter from Home", "Rat Race"), not bureaucratic labels.
- Section headings are already named as story moments — the design should honour that, not flatten them into small-caps utility labels.

**Typography confirmed:**
- Cinzel: cycle label only (the one display moment)
- Lato: section headings, labels, roll results
- Libre Baskerville: all narrative body text

**Actual content ratio (from real data):** 40–60% narrative, 40–60% mechanical. Interleaved — narrative section then its matching action card, not correspondence-first then cards at bottom.

---

## SCAMPER Design Decisions

### Substitute
- Full card border → **left-border accent only** (`--gold2`, 3px). No box, no radius.
- `.story-cycle-label` strip → **full-width Cinzel display heading** (22–24px, centred, generous padding).
- `.proj-card-type-chip` badge → **Lato italic prefix** inline with card title ("Resources ·").
- `--txt2` on narrative body → **`--txt`** (full cream, highest legibility).

### Combine
- Pool expression + roll result → **one line**: "Wits + Streetwise 7 · 4 successes" in small Lato `--txt3`.
- Section heading flows into narrative as typographic introduction, not a separated label zone.

### Adapt
- Theatre programme convention → **thin horizontal rule** (`1px`, `--bdr2`) between sections. No card borders, no box shadows. The rule is the separator.
- Correspondence dateline → section title in Lato sentence case signals reading mode.

### Modify
- Narrative font: **16px** (from 14px)
- Line-height: **1.85** (from 1.7)
- Section heading: **Lato 14px, sentence case** (from 12px all-caps)
- Roll result: **larger, bolder, most visually prominent element** on the card

### Eliminate
- **`.proj-card-objective`** — player's desired outcome restated. Not needed at game or in transit.
- **border-radius** on project cards — straight edges read as document, not widget.
- **Background fill** on `.story-entry` — let `--bg` be the page.
- **`--surf2` container background** — the dark page is the container.

### Reverse
- ~~Project card hierarchy~~ — **NOT adopted.** Confirmed structure is Title → Fiction → Card details. Card internal order unchanged.

---

## Confirmed Design Direction

**Design #3 — Breathing Correspondence**

Structure per section:

**Title** — Lato medium, sentence case, 14px, `--txt`, thin `--bdr2` ruled line beneath.

**Fiction** — Libre Baskerville, 16px, `--txt`, 1.85 line-height. No background, no box. The dark page is the page.

**Card (after narrative)** — Left-border accent `--gold2` 3px. No box. No radius. No fill.
- Roll result: prominent, Lato, coloured by outcome (gold = exceptional, crimson = failure, `--txt2` = standard)
- ST note: Libre Baskerville 13px, `--txt3`
- Pool expression: small Lato, `--txt3`, de-emphasised

**Cycle Label** — Cinzel 22–24px, centred, full-width, generous padding. The only Cinzel usage in the view. Earns authority by restraint.

---

## Prioritised Implementation Order

| Priority | Change | Notes |
|---|---|---|
| 1 | Typography: 16px body, 1.85 line-height, `--txt` | Biggest legibility gain, lowest risk |
| 2 | Cycle label as Cinzel display heading | Isolated element, sets tone |
| 3 | Remove card backgrounds + box borders | Visual coherence |
| 4 | Left-border accent on cards (`--gold2`, 3px) | Replaces removed chrome |
| 5 | Eliminate `proj-card-objective` | Simple removal |
| 6 | Section heading restyling: Lato sentence case + ruled line | Final polish |

---

## Session Summary

**Breakthrough:** The DT report isn't a portal widget — it's a threshold ritual. Players read it to cross into the game world. The design should feel like that crossing.

**Core insight:** The current CSS applied player-portal patterns to a fundamentally different context. The fix isn't to tweak the ported styles — it's to design natively for the dark, mobile, atmospheric reading experience the game app demands.

**Design anchor:** "Breathing Correspondence" — text that reads like a letter, structure that reads like a programme, chrome reduced to the minimum needed for legibility.
