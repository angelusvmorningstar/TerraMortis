---
id: dt-form.22
task: 22
epic: epic-dt-form-mvp-redesign
status: Draft
priority: medium
depends_on: ['dt-form.17', 'dt-form.20', 'dt-form.24']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Q2)
---

# Story dt-form.22 — ROTE hunt as a personal-project-action variant

As a player who wants to use ROTE hunt to feed a second time in a downtime cycle,
I should declare ROTE as a personal-project-action (consuming one of my project slots) where the dice pool is reused from my primary feeding and only the territory is selectable,
So that ROTE has a clean home in the project-actions area rather than a parallel sub-block in the feeding section.

## Context

**Architectural correction 2026-05-06 (Piatra Q1 follow-up):** ROTE is **not a feeding-section sub-action**. It is a **personal-action variant** that consumes one of the player's project slots. The pool is reused from the primary hunt; only the territory (potentially a new one) is selectable.

This corrects the earlier draft which positioned ROTE as a feeding-section secondary block. The corrected design:

- ROTE lives as one of the action types available in a Personal Action slot (alongside `attack`, `feed`, `xp_spend`, etc.)
- ROTE uses the same dice pool as the primary hunt (reads it from the feeding section's auto-derived pool per #20)
- Player picks the ROTE territory (potentially different from primary)
- The existing schema already supports this: `project_N_feed_method2` field in `downtime_submission.schema.js`
- ROTE alone does **NOT** satisfy MINIMAL completeness — primary feeding is still required separately

A player who wants to use ROTE for their MINIMAL "1 project slot" allocation can do so: ROTE-in-the-project-slot is a valid project-slot action. But primary feeding must also be filled in the feeding section.

### Files in scope

- `public/js/tabs/downtime-form.js` — the project-action render path; add ROTE as a recognised action type that surfaces a territory-only picker (pool is read-only and inherited from primary feeding)
- `public/js/data/dt-completeness.js` — confirm primary feeding is the gate; ROTE selection in the project slot is NOT what unlocks MINIMAL feeding's rule
- `server/schemas/downtime_submission.schema.js` — confirm `project_N_feed_method2` already exists (and any sibling fields like `project_N_feed_territory2`); document under `properties` if missing

### Files NOT in scope

- Primary feeding logic (covered by #20 — primary stays in the feeding section)
- The personal-actions chrome strip (covered by #24; ROTE follows whatever the post-#24 action UI looks like)
- Feeding territory tinting (#21)

## Acceptance Criteria

**Given** a player selects ROTE as a project-slot action type
**When** the slot renders
**Then** the slot shows a territory selector (using `charPicker`-style or chip-style territory picker, consistent with the feeding section's territory UX) and a read-only pool annotation displaying the inherited primary-feeding pool ("Pool: 7 (inherited from primary hunt)" or similar).

**Given** the player has not filled primary feeding
**When** they select ROTE as a project action
**Then** the read-only pool annotation surfaces a clear note: "Pool will be derived from primary feeding once you fill it." The ROTE selection persists; the pool annotation updates once primary feeding is filled.

**Given** the player selects a ROTE territory
**When** the form persists
**Then** the territory is saved to `responses.project_N_feed_territory2` (or the existing schema field; confirm during pickup survey). The pool is NOT separately persisted; it is derived from primary feeding at render and execute time.

**Given** a MINIMAL-mode submission has ROTE in the project slot but no primary feeding filled
**When** `isMinimalComplete()` is evaluated
**Then** the rule **fails** (primary feeding is missing). The banner from #17 surfaces "Primary feeding is required" as the missing piece.

**Given** a MINIMAL-mode submission has primary feeding filled AND ROTE in the project slot
**When** `isMinimalComplete()` is evaluated
**Then** the rule **passes** (primary feeding satisfies feeding; the project-slot rule is satisfied because ROTE is a valid project action; mode set is complete).

**Given** the implementer's current-state survey
**When** they grep for `_feed_method2`, `_feed_territory2`, `rote`, `ROTE`
**Then** they confirm the existing schema field set and document survey findings in DAR. If a field is missing, surface to Piatra rather than inventing a new shape.

## Implementation Notes

### Survey first

`project_N_feed_method2` is the existing schema field per Piatra's note. Confirm via:
```bash
grep -n "feed_method2\|feed_territory2\|_rote" public/js/tabs/downtime-form.js server/schemas/downtime_submission.schema.js
```

The expected pattern: a project slot of type `feed` already has a method/territory pair; ROTE adds a second method/territory pair (`_method2`/`_territory2`) for the ROTE variant. If that's the existing shape, ROTE is a UI surface over an already-supported data shape.

### Pool inheritance

The primary feeding pool is auto-derived per #20. ROTE reads the same value at render-time via the same helper. Implementation: import the primary-pool computation helper from #20, call it from the ROTE render path. Read-only display.

### MINIMAL gate

`isMinimalComplete()` (owned by #17) has a `feeding` rule. That rule reads the **primary** feeding fields (`responses._feed_*`), not the ROTE fields. ROTE in a project slot is captured under the `1 project slot` MINIMAL rule (any action type counts), not the feeding rule.

## Test Plan

- DAR: survey output for the schema field set
- Static review: ROTE is a project-action variant; primary feeding is independent; MINIMAL rules confirmed against both fields
- Browser smoke (DEFERRED):
  1. Pick ROTE in project slot → territory picker appears; pool annotation shows inherited pool (or "fill primary feeding first" note)
  2. Fill primary feeding → ROTE pool annotation updates with the derived pool
  3. MINIMAL submission with ROTE only (no primary) → banner shows "Primary feeding required" from #17
  4. MINIMAL submission with primary + ROTE in project slot → passes MINIMAL gate

## Definition of Done

- [ ] ROTE renders as a project-action variant (territory picker + read-only inherited pool)
- [ ] No ROTE block in the feeding section
- [ ] `project_N_feed_method2` / `project_N_feed_territory2` schema fields confirmed (or surfaced for clarification)
- [ ] `isMinimalComplete()` does NOT count ROTE-only as feeding-complete
- [ ] PR opened into `dev`

## Dependencies

- **Upstream**: #17 (lifecycle + `isMinimalComplete()`); #20 (simplified primary feeding — pool helper to inherit); #24 (personal-actions chrome strip — ROTE renders inside the post-#24 action slot UI)
- **Downstream**: none

## Note on the architectural correction

This story was originally drafted as a feeding-section secondary block with ROTE-only-counts-as-MINIMAL semantics. The correction (Piatra 2026-05-06 follow-up) repositions ROTE as a personal-project-action variant and requires primary feeding for MINIMAL. All ACs above reflect the corrected design.
