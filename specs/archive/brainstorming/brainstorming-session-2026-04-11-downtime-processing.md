---
stepsCompleted: [1, 2, 3]
session_topic: 'Downtime Processing Mode — ST methodology support'
session_goals: 'Design a processing-mode view for the DT admin tab that supports the ST team methodology, multi-ST collaboration, and ambience automation'
selected_approach: 'Phase-by-phase queue design + iterative story scoping'
techniques_used: ['codebase survey', 'manual doc analysis', 'methodology mapping', 'design Q&A']
---

## Session Overview

**Topic:** Downtime Processing Mode — making the DT admin tab support the actual ST methodology
**Goals:** Design the queue view, collaboration model, sorcery dependency handling, and ambience automation. Scope into one story per phase.

**Date:** 2026-04-11

**Context reviewed:**
- `public/js/admin/downtime-views.js` — full survey of existing DT admin tab (3192 lines)
- `Downtime 2 - Ambience Matrix.docx` — manual ambience calculation spreadsheet
- `Downtime 2 - Feeding Matrix.docx` — manual feeding pool validation + territory matrix
- `Downtime 2 - Projects.docx` — manual projects processing doc with ST notes and pool corrections
- `docs/process/Downtime1_Process_Retrospective.md` — full retrospective of DT1 processing methodology

---

## Problem Statement

The existing DT admin tab is **character-centric**: open one submission, work through it, close it. The ST methodology is **action-type-centric**: process all ambience projects across all characters first, then all global/area effects, then defensive, etc. The mismatch is the primary source of processing friction.

Three specific problems:

1. **The view is wrong** — no cross-character, priority-sorted action queue exists
2. **Notes are the wrong shape** — one `st_notes` text block per submission; what's needed is per-action attributed threads (AM Note, KW Note, SY Note)
3. **Sorcery creates a dependency** — Theban and Cruac rituals can grant Attribute/Skill bonuses or pool modifiers; those must resolve before any dependent action is finalised

---

## Key Design Decisions

### Processing Mode

A second view on the DT tab — "Processing Mode" alongside the existing per-character view. Switching between them is a tab or toggle. The per-character view stays for full top-to-bottom reads; the processing queue is for working through the methodology.

### Action Classification

Actions are sorted into phases using the existing `action_type` field on each project/merit action submission. STs can re-tag an action in the processing view if the player's submitted type is wrong. The `action_type` value is the canonical sort key.

Phase order:
```
RESOLVE FIRST     — Theban Sorcery, Cruac ritual actions
PHASE 1           — Feeding (all characters)
PHASE 2           — Ambience projects
PHASE 3           — Global / area effect
PHASE 4           — Defensive / protective
PHASE 5           — Investigative
PHASE 6           — Hostile / attack
PHASE 7           — Other / misc
ALLIES & STATUS   — sub-queue, same priority ordering within
CONTACTS          — sub-queue
RESOURCES         — sub-queue
```

### Per-Action Infrastructure (shared across all phases)

Every action in the queue has:
- **Player's submitted pool** — read-only, from submission responses
- **ST validated pool** — editable field; blank until confirmed
- **Validation state** — `Pending` / `Validated` / `No Roll Needed`
- **ST notes thread** — attributed to logged-in Discord identity, timestamped, append-only, multiple STs. ST-only.
- **Player feedback field** — separate single-line field; this is what the player sees
- **Roll button** — enabled only when Validated
- **Result** — displayed once rolled

The notes thread model (not a text area):
```
[AM]  13:45  Pool corrected — Wits + Stealth + Obfuscate, not Auspex.
[KW]  14:02  Agreed. Eye Behind the Glass — check George's understanding.
[SY]  14:18  Confirmed. Rolling as Wits 3 + Stealth 1 + Obfuscate 1 = 5.
```

Attribution uses the logged-in ST's Discord display name. All three STs have individual Discord logins and can be working simultaneously.

### Sorcery Dependency Model

When a ritual action resolves:
1. ST records the outcome (free text — too varied to codify; e.g. "+4 to pool, Rote quality, -1 Vitae per participant")
2. ST can attach a **reminder note** to any number of other actions in the cycle (select from a list)
3. The reminder appears as a visible flag on each affected action: `⚑ Ritual effect: +4 to pool, -1 Vitae (We Own the Night — Jack P1)`

No auto-propagation of stats — Attribute/Skill bonuses from rituals are applied directly in the character editor (bonus dots). The reminder is a human flag, not a mechanical dependency lock. The ST manually accounts for the bonus when entering the validated pool.

Ritual actions are surfaced at the top of the processing queue regardless of their submitted `action_type`.

### Ambience Dashboard

A live calculation panel, updating as actions resolve:

| Territory | Starting | Entropy | Overfeeding | Influence | Projects | **Net** |
|---|---|---|---|---|---|---|
| Academy | Settled | -1 | 0 | +6 | +5 | **+10** |
| Harbour | Tended | -1 | 0 | +5 | +1 | **+5** |

Calculation: `net = starting_step + entropy(-1) + overfeeding_penalty + influence_net + project_successes`
Cap: max +1 step improvement per month; up to -2 steps degradation.

Below the ambience table: **Discipline Profile Matrix** — discipline × territory, counting uses in:
- Feeding actions only (where the discipline was in the validated pool)
- Ambience-affecting project/ally actions (where the discipline was in the validated pool)

Not counted: disciplines used in non-territory-affecting actions (defensive, investigative, hostile, etc.)

This is a narrative reference for STs writing territory reports. It surfaces: "Obfuscate has been used heavily in the Academy for feeding — lean into that."

---

## Stories to Create

- **feature.43** — Processing Mode Backbone: action classification, phase sections, notes thread, validation state machine
- **feature.44** — Phase 0: Sorcery/Ritual Priority queue, outcome recording, reminder attachment to affected actions
- **feature.45** — Phase 1: Feeding Review — cross-character feeding queue, pool validation, discipline × territory recording
- **feature.46** — Phase 2-N: Actions Queue — projects + merit actions by priority, Allies/Contacts/Resources sub-queues
- **feature.47** — Ambience Dashboard — live calculation + discipline profile matrix

---

## Session Complete
