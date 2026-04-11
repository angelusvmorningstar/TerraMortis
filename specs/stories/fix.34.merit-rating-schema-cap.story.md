# Story fix.34: Merit Rating Schema Cap Removed

## Status: done

## Story

**As an** ST,
**I want** characters whose merits have aggregate ratings above 5 to save without errors,
**so that** legitimate multi-source grant stacking is not rejected at the server.

## Background

`character.schema.js` declared the merit `rating` field as:

```json
"rating": { "type": "integer", "minimum": 0, "maximum": 5 }
```

The `rating` field in the v2 schema is a computed aggregate: the sum of `cp + xp + free_mci + free_vm + free_lk + free_ohm + free_inv + free_bloodline + free_pet + free_pt + free_mdb + free_sw + free_attache`. Multiple overlapping grant sources can push a merit's effective rating well above 5 — this is intentional and rules-legal in some cases.

**Trigger case:** Wan's sheet failed to save. Her merit data had a `rating` value above 5 from combined CP, XP, and free_* sources. The schema rejected this as `must be <= 5`.

## Fix

Removed the `maximum: 5` constraint from the merit `rating` field in `character.schema.js`:

```json
// Before
"rating": { "type": "integer", "minimum": 0, "maximum": 5 }

// After
"rating": { "type": "integer", "minimum": 0 }
```

The rating value is always derived, not user-entered in isolation. Upper-bound validation, if ever needed, belongs in `audit.js` with domain-specific logic, not as a hard JSON schema cap.

## Files Changed

- `server/schemas/character.schema.js` — removed `maximum: 5` from merit `rating` field

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-11 | 1.0 | Story authored + implemented | Claude (SM) |
