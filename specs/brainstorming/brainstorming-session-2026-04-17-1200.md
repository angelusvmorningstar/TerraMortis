---
stepsCompleted: [1, 2]
selected_approach: 'ai-recommended'
techniques_used: ['First Principles Thinking', 'Metaphor Mapping', 'SCAMPER Method']
inputDocuments: []
session_topic: 'Status & Power Visualisation — Terra Mortis TM Suite'
session_goals: 'Decide visual design for City Status pyramid (scale 1-10), Clan/Covenant pyramids (scale 1-5), and Influence/Sphere view redesign (ST admin). Resolve data sourcing and layout questions so stories can be written.'
selected_approach: ''
techniques_used: []
ideas_generated: []
context_file: ''
---

# Brainstorming Session Results

**Facilitator:** Angelus
**Date:** 2026-04-17

## Session Overview

**Topic:** Status & Power Visualisation — Terra Mortis TM Suite player app and ST admin city tab

**Goals:**
- Determine what the pyramid visual components look like (City Status scale 1–10, Clan/Covenant scale 1–5)
- Decide whether pyramids replace or augment the existing two-column status layout
- Determine how City Status data is sourced (derived vs stored field)
- Resolve how the Sphere/Influence redesign (ST admin) relates to items 4/5

### Session Setup

_Fresh session initialised 2026-04-17. Context provided via Bob/Mary handoff — Cluster C from backlog analysis._

## Technique Selection

**Approach:** AI-Recommended
**Analysis Context:** Status & Power Visualisation — known data structure (per-character city/clan/covenant status + sphere influence), open visual design space, rich thematic context (Vampire LARP).

**Recommended Techniques:**
- **First Principles Thinking:** Strip the "pyramid" assumption — clarify what each view must *do* before deciding what it looks like
- **Metaphor Mapping:** Use the Terra Mortis world itself as the visual language source
- **SCAMPER Method:** Apply systematically to the existing two-column status layout to generate concrete design options

**AI Rationale:** Problem is concrete in data but open in visual form. Sequence moves why → what → how to ensure design decisions are grounded, not arbitrary.

## Design Decisions — Status & Power Visualisation

### Structural Principles (from First Principles session)

**[Principles #1]: Crown-and-Court Structure**
*Concept:* Ranks 4–5 are defined seats — scarce, named, potentially vacant. Ranks 1–3 are the open floor — uncapped crowd. Two fundamentally different zones displayed in one view.
*Novelty:* Top tiers are *positions*, lower tiers are *standings*. Design should reflect that distinction.

**[Principles #2]: Visual Weight Scales With Scarcity**
*Concept:* Rank 5 looms — large, isolated, visually heavy. Rank 4 carries weight but shares it between two. Ranks 1–3 are compact and scrollable. Visual mass communicates the game rule.
*Novelty:* Size is doing real semantic work — teaching the player how the game works just by looking.

**[Principles #3]: The Empty Throne**
*Concept:* A vacant rank 5 (or 4) slot should retain its full visual weight. An empty seat of power communicates political vacancy, opportunity, instability.
*Novelty:* Most ranking displays hide empty positions. Here, the empty slot is news.

**[Principles #4]: Composite Status Display**
*Concept:* Characters are placed in tiers by effective status (innate + title bonus). The display reveals the split. Example: Head of State shows effective 6, with 3 innate and 3 title-derived — strip the title and they fall to rank 3.
*Novelty:* Political vulnerability made legible at a glance. Extends existing ●/○ dot system.

**[Principles #5]: Shared Architecture Across All Three Views**
*Concept:* City (1–10), Clan (1–5), Covenant (1–5) all share the same looming-apex / widening-tiers / open-floor structure. One component system, three instances.
*City caps:* 1 at 10 | 2 at 9 | 2 at 8 | 3 at 7 | 3 at 6 | 4 at 5 | 4 at 4 | open below
*Clan/Covenant caps:* 1 at 5 | 2 at 4 | open below

### Display Specification

| Zone | Tiers | Visual Treatment |
|------|-------|-----------------|
| Named Zone (looming) | Rank 5 (city 10) | Full-width or near-full card, large typography, prominent gold border, elevated visual weight, shows even when vacant |
| Named Zone (imposing) | Rank 4 (city 9–8) | Two cards side by side, significant but smaller than apex, gold-accented |
| Open Zone | Ranks 1–3 (city 1–7) | Compact character rows, scrollable list |

### Dot System Extension for Innate vs Title

Extend the existing ● / ○ dot system:
- **●** (solid gold) = innate/inherent status dots
- **◐** or outlined/lighter variant = title-derived bonus dots
- Display: `●●●◐◐◐` = effective 6, innate 3, title 3
- Placement in tier based on effective total; innate dots reveal the "real" standing

### Relationship to Item 18 (Sphere View — ST Admin)

Separate visual language from player-facing status. ST admin needs to see hierarchy and limits per sphere (caps matter) but in a functional/administrative register — not the dramatic looming treatment. Compact cards per sphere showing who holds what rank and whether slots are filled or vacant. Design priority: clarity and editability over theatre.
