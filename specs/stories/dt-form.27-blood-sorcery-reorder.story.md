---
id: dt-form.27
task: 27
issue: 80
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/80
branch: morningstar-issue-80-blood-sorcery-reorder
epic: epic-dt-form-mvp-redesign
status: review
priority: medium
depends_on: ['dt-form.17']
adr: specs/architecture/adr-003-dt-form-cross-cutting.md (§Audit-baseline)
---

# Story dt-form.27 — Blood Sorcery section reorder (Crúac / Theban)

As a player using Blood Sorcery (Crúac or Theban) in downtime,
I should see the rituals reordered into a logical reading order (e.g. Crúac vs Theban grouped, or by tier, or by frequency-of-use),
So that finding the ritual I want to declare is faster than scrolling the current order.

## Context

ADR-003 §Audit-baseline lists `blood_sorcery` as the section with reordering as task #27: *"Crúac/Theban; conditional on rituals owned. Remediation reorders (task #27)."* The exact target order isn't specified in the ADR — implementer should propose during pickup.

This is ADVANCED-only per ADR §Q2 (blood_sorcery is not in the MINIMAL set). Players who use ritual sorcery declare it via the ADVANCED variant.

### Files in scope

- `public/js/tabs/downtime-form.js` — the `blood_sorcery` section render path
- Possibly `public/js/data/rituals.js` (or wherever ritual reference data lives) if a sort key is needed; otherwise just a render-side reorder

### Files NOT in scope

- The ritual reference data itself (Crúac and Theban canon — not changing)
- The conditional-on-rituals-owned gating (already in place; preserve it)
- The MINIMAL gate (this section stays ADVANCED)

## Acceptance Criteria

**Given** a player owns ritual sorcery
**When** the Blood Sorcery section renders in ADVANCED mode
**Then** the rituals are presented in this order: **Crúac first, then Theban** (per Piatra clarification 2026-05-06). Within each style, alphabetical-by-name unless the implementer surfaces a better-justified alternative during pickup.

**Given** a player does not own any ritual sorcery
**When** the Blood Sorcery section is evaluated
**Then** the section does not render (existing conditional preserved).

**Given** the reordering ships
**When** an existing player opens their cycle's submission
**Then** their already-selected rituals load correctly (no data loss; persistence keys unchanged).

## Implementation Notes

### Render order — what the code actually does today

The form HTML builder in `public/js/tabs/downtime-form.js` renders sections by explicit sequence, not by iterating `DOWNTIME_SECTIONS`. Blood sorcery is currently at **lines 2028–2031**, between Personal Story and Territory/Feeding:

```
Personal Story
Blood Sorcery   ← CURRENT (comment says "rites affect hunt pool")
Territory
Feeding
Projects (Personal Actions)
if (mode === 'advanced') {
  renderMeritToggles  ← "Sphere Actions"
  Acquisitions
  Equipment
}
```

**Target position:** inside the `if (mode === 'advanced')` block, before `renderMeritToggles`.

### The exact change — `public/js/tabs/downtime-form.js`

**Step 1 — remove the current render block (lines 2028–2031):**
```javascript
// DELETE:
  // ── Blood Sorcery before Territory/Feeding — rites can affect hunt pool ──
  if (gateValues.has_sorcery === 'yes' && _isSectionVisibleInMode('blood_sorcery', mode)) {
    h += renderSorcerySection(saved);
  }
```

**Step 2 — insert inside `if (mode === 'advanced')` (line ~2055), before `renderMeritToggles`:**
```javascript
  if (mode === 'advanced') {
    // ── Blood Sorcery — between Personal Actions and Sphere Actions ──
    if (gateValues.has_sorcery === 'yes') h += renderSorcerySection(saved);

    // ── Dynamic merit sections ──
    h += renderMeritToggles(saved);
    ...
  }
```

The `_isSectionVisibleInMode` check is dropped — redundant inside the `mode === 'advanced'` guard.

### Crúac-before-Theban — already correct, no sort change needed

`renderSorcerySection` sorts rites at line 4265:
```javascript
rites.sort((a, b) => a.tradition.localeCompare(b.tradition) || a.level - b.level || a.name.localeCompare(b.name));
```
`'Cruac'.localeCompare('Theban')` is negative → Crúac already sorts first. Within each tradition: level ascending, then name alphabetical.

### Section title update — `public/js/tabs/downtime-data.js` line 228

Current: `title: 'Blood Sorcery: Theban and Cruac'` — Theban listed first, inconsistent with render order.
Change to: `title: 'Blood Sorcery: Crúac and Theban'`

### Persistence keys — unchanged

Sorcery response keys (`sorcery_slot_count`, `sorcery_N_rite`, `sorcery_N_targets_*`) are not positional. Moving the section does not affect saved data. Existing submissions load correctly.

### What NOT to change

- `renderSorcerySection` internals — no logic change
- The `has_sorcery` gate check (`discDots > 0` for either tradition)
- Any MINIMAL-mode path — blood_sorcery was never in MINIMAL

## Test Plan

- Static review: blood_sorcery block moved to `mode === 'advanced'`; `_isSectionVisibleInMode` call removed; section title updated
- Browser smoke (DEFERRED): open form as Crúac or Theban character in ADVANCED mode; confirm section appears after Projects and before Sphere Actions; confirm Crúac rites listed before Theban; select a rite, save, reload — confirm selection persists

## Definition of Done

- [x] Target order documented (Crúac first, Theban second — existing sort already correct)
- [x] Blood Sorcery section renders after Projects and before Sphere Actions in ADVANCED mode
- [x] Section title updated to `Blood Sorcery: Crúac and Theban`
- [x] Conditional-on-rituals-owned gate preserved
- [x] Persistence keys unchanged (no data loss)
- [ ] PR opened into `dev`

## Dev Agent Record

**Agent:** Claude Sonnet 4.6 (James)
**Date:** 2026-05-06

### File List

**Modified**
- `public/js/tabs/downtime-form.js` — removed blood_sorcery render block from between Personal Story and Territory/Feeding; inserted inside `if (mode === 'advanced')` before `renderMeritToggles`
- `public/js/tabs/downtime-data.js` — updated section title from `Blood Sorcery: Theban and Cruac` to `Blood Sorcery: Crúac and Theban`; updated comment to reflect new position

### Completion Notes

Two files, three edits. The render position move drops the `_isSectionVisibleInMode` guard (redundant inside `mode === 'advanced'`). The within-section Crúac-before-Theban sort was already correct (`localeCompare` puts 'C' before 'T'). Persistence keys untouched. Browser smoke deferred per Test Plan.

### Change Log

| Date | Author | Change |
|---|---|---|
| 2026-05-06 | James (dev) | Moved blood_sorcery render to ADVANCED block between Projects and Sphere Actions. Updated section title to Crúac-first. Status → review. |

## Dependencies

- **Upstream**: #17 (rendering gate; ADVANCED-only)
- **Downstream**: none
