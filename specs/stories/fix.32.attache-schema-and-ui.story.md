# Story fix.32: Attaché Schema Fields + Breakdown UI Fix

## Status: done

## Story

**As an** ST,
**I want** Attaché-related fields to save without schema errors and the Attaché breakdown inputs to display side-by-side inline,
**so that** Attaché grants are persistent and the edit UI is consistent with all other breakdown rows.

## Background

After feature.30 was implemented, two issues emerged:

1. **Save failures**: `character.schema.js` had `additionalProperties: false` on merit objects but was missing `free_attache`, `retainer_source`, and `attache_key`. Also missing were `free_pet` (used for K-9/Falconry grants) and `free_sw` (Safe Word grant). The save endpoint rejected any character with these fields set.

2. **Ugly UI**: The initial Att breakdown group put the retainer selector dropdown and dots input inside a single `bd-grp` div with `flex-direction: column`. This made it taller than the other groups and visually inconsistent. The user flagged: "this is a bit ugly, what if they were positioned side by side? and the drop down should match the other drop downs."

## Fix

### Schema additions (`server/schemas/character.schema.js`)

Added to the merit object `properties`:
- `free_pet: { type: 'integer', minimum: 0 }` — K-9/Falconry retainer dot grants (renamed from stale `free_retainer`)
- `free_sw: { type: 'integer', minimum: 0 }` — Safe Word oath grant
- `free_attache: { type: 'integer', minimum: 0 }` — Attaché retainer-funded dots
- `attache_key: { type: 'string' }` — stable retainer key (A1, A2, ...)
- `retainer_source: { type: 'string' }` — which retainer funds this child merit

Removed stale `free_retainer` (had been renamed to `free_pet` in code).

### Breakdown UI fix (`public/js/editor/xp.js` — `meritBdRow`)

Replaced single combined `bd-grp` for Att with two separate `bd-grp` divs:

```
[Att label][select dropdown]   [dots label][number input]
```

The select uses `merit-bd-input bd-bonus-input` class (matching all other selects). The number input is a standard `merit-bd-input bd-bonus-input`. Both sit side-by-side via the existing `bd-grp` flex layout.

## Files Changed

- `server/schemas/character.schema.js` — add free_pet, free_sw, free_attache, attache_key, retainer_source; remove stale free_retainer
- `public/js/editor/xp.js` — split showAttache from 1 bd-grp into 2 bd-grp divs

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored + implemented | Claude (SM) |
