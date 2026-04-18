---
stepsCompleted: [1, 2, 3]
session_topic: 'Game Cycle system — what is built, what is missing, what to build next'
session_goals: 'Survey existing phases, identify gaps, prioritise next builds, flag design decisions needed'
selected_approach: 'Gap analysis + targeted story scoping'
techniques_used: ['codebase survey', 'phase mapping', 'design Q&A']
---

## Session Overview

**Topic:** Game Cycle system — planning what's built, what's missing, and what needs to be built next
**Goals:** Survey each of the 8 phases; identify gaps; prioritise; surface design decisions

**Date:** 2026-04-11

---

## Phase Inventory

| Phase | Built | Gap |
|---|---|---|
| 1. Feeding opens | feeding-tab.js, feeding-engine.js, full method/pool/roll system | Pre-prime from DT not confirmed end-to-end; vessel vitae allocation not built |
| 2. Pre-sign-in / payment | paid + payment_method fields on attendance | No pre-game sign-in workflow |
| 3. Game happens | Attendance tracking | No "game in progress" status |
| 4. Regency confirm | fix.36 + fix.39 | Done |
| 5. Downtimes open | Full downtime form, cycle active state | Done |
| 6. Downtimes close | Close Cycle button | Done |
| 7. ST processing | Admin panel, fix.40 (Peter) | fix.40 in progress |
| 8. Push cycle | Publish outcomes + Open Game Phase buttons | No single push flow; no pre-push warning checklist |

---

## Key Design Decisions Resolved

### Push Cycle (Phase 8)
- Complex step — needs redundancy and safety checks
- Pre-push warning: flag submissions without a reply; ST must dismiss each before proceeding
- Bulk publish all ready outcomes simultaneously
- Then: "Open feeding?" confirmation
- Then: "Confirm date / deadline for next game" → creates new cycle

### Feeding Roll (Phase 1)
- Pre-loaded from approved DT submission: pool, rote, 9-again
- One-shot roll — no retries, locked after rolling
- Each success = 1 vessel card
- Player allocates vitae per vessel:
  - 1–2 vitae: safe (no lasting harm)
  - 3 vitae: Drained Condition — needs medical care / blood transfusion
  - 4–5 vitae: serious injury — hospitalisation
  - 6 vitae: critical — near death
  - 7 vitae: fatal — vessel dies
- Average mortal: 7 health (Stamina 2 + Size 5)
- System records choice per vessel; ST sees aggregate in log
- Cannot be automated — players must choose how much to take
- Discipline dramatic failure: if discipline used in pool AND successes = 0 → "See ST at game before feeding" flag
- Applies to any discipline (not just specific ones)

### Deadlines
- Manual — ST sets them explicitly, no auto-calculation

---

## Stories to Create

- **feature.41** — Push Cycle wizard (pre-push warnings, bulk publish, open feeding, new cycle)
- **feature.42** — Feeding panel: pre-primed one-shot roll + per-vessel vitae allocation

---

## Session Complete
