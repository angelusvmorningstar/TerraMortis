# Story tech-debt.552: Merge and relink fragmented attendance data for Games 1-3

## Status: review

## Issue
[#552](https://github.com/angelusvmorningstar/TerraMortis/issues/552) — Merge and relink fragmented attendance data for Games 1-3

## Branch
`ms/issue-552-merge-relink-attendance`

---

## Story

**As a** system administrator,
**I want** each game session's attendance collapsed to one entry per character keyed to the current character_id,
**so that** XP calculations, finance totals, and downtime reads all see one authoritative record instead of duplicates.

---

## Background

Game sessions for Games 1-3 have two attendance entry populations per character:

| Population | character_id epoch | Data carried | Game 1 auth? | Games 2/3 auth? |
|---|---|---|---|---|
| **Legacy / rich** | old `69ccb81b…` ids | name, costuming, downtime, payment | No | **Yes** |
| **Current / thin** | current `69d73ea4…` ids | attended tick, payment (re-entered) | **Yes** | No |

`game-xp.js` matches by `character_id` OR `name` with no dedup — both entries resolve, both are summed → double XP. `derivePayments()` sums every entry → double-count in finance.

**Dependency**: `transfer` enum (#550, already merged). The merge will write `method: 'transfer'` to entries that had "Transfer (Lyn)" — the enum must exist first.

**The preview script `server/scripts/preview-attendance-merge.js` already contains the complete resolution logic**, validated against live data. The merge script is that logic plus write output.

---

## Acceptance Criteria

- [ ] After merge: every session has exactly one entry per character, keyed by a current `character_id` (0 unmatched by id)
- [ ] Game 1: attendees score 3 base XP (+ extra); non-attendees Jelle/Ryan/Julia score 0; Mammon/Yusuf score 1 (DT only)
- [ ] Games 2/3: per-player costuming/downtime preserved; Keeper/Henry St. John scores correctly
- [ ] Payment methods normalised to fin.2 enum (`transfer` for legacy "Transfer (Lyn)"); `paid` derived from method
- [ ] Game 4 untouched
- [ ] Script: dry-run by default, `--apply` to execute, post-merge verification printed

---

## Scope

**In scope**: one new script `server/scripts/merge-attendance.js`. No frontend changes, no server route changes.

**Out of scope**: dedup-proofing `game-xp.js` / `finance-tab.js` (#551 handles the positional-index bug separately).

---

## Dev Notes

### Overview

The merge script is `preview-attendance-merge.js` adapted to write. All resolution logic (`buildResolver`, `normaliseMethod`, richest-entry selection, per-game policy) is already validated in the preview — copy it verbatim. The new work is:

1. Build a clean `mergedEntry` object (the attendance entry to write)
2. Safety checks before any write
3. `updateOne` with `$set: { attendance: mergedArray }` per session
4. Post-apply verification

### `mergedEntry` shape

Each merged attendance entry must contain:

```js
{
  character_id:      String(c._id),          // current id — the whole point
  character_name:    c.name,
  character_display: c.moniker || c.name,
  name:              c.name,                 // keep legacy field for admin fallback
  display_name:      c.moniker || c.name,    // keep legacy field for admin fallback
  player:            c.player || '',
  attended:          merged.attended,
  costuming:         merged.costuming,
  downtime:          merged.downtime,
  extra:             merged.extra,
  payment: {
    method: merged.method,
    amount: PAID_METHODS.has(merged.method) ? (session.session_rate || 0) : 0,
  },
  payment_method:    merged.method,          // keep legacy field for admin tab compat
  paid:              PAID_METHODS.has(merged.method),
}
```

`PAID_METHODS = new Set(['cash', 'payid', 'paypal', 'transfer'])` — same as signin-tab.js.

### Per-game merge policy (copy from preview-attendance-merge.js)

```
Game 1 — idEntry || richest entry as base for method; attended→full XP rule
Game 2/3 — richest entry for all fields; relinked to current id
```

See `preview-attendance-merge.js:95–128` for the exact field-selection logic. Copy it verbatim — do not rewrite.

### Safety checks (abort on any failure)

Before writing any session:
1. Every entry in the merged array has a `character_id` that exists in `characters` collection
2. No two entries in the merged array share the same `character_id`
3. The merged entry count ≤ original entry count (we collapse, never expand)
4. Game 4 (`69e998779061c095792fd40c`) is NOT in the sessions being processed

### Run commands

```
# Dry run (always do this first):
node --env-file=../.env scripts/merge-attendance.js
# from server/ directory

# Apply after reviewing dry-run output:
node --env-file=../.env scripts/merge-attendance.js --apply
```

User runs `--apply` themselves. Do NOT auto-execute.

### Post-apply verification output

After `--apply`, print for each game:
```
Game N — session_date
  Before: X entries  After: Y entries  Collapsed: Z
  Unmatched (should be 0): 0
  Duplicates remaining (should be 0): 0
  Attended: N  Costuming: N  Downtime: N  Paid: N
```

### Pattern to follow

`server/scripts/cleanup-sessions-and-cycles.js` — same MongoClient / DRY_RUN / MONGO_URI pattern. Copy the boilerplate exactly.

### What NOT to change

- `preview-attendance-merge.js` — do not modify, it is a read-only audit tool
- `public/js/data/game-xp.js` — no changes (dedup hardening is deferred)
- `public/js/game/finance-tab.js` — no changes
- Any server routes

---

## Dev Agent Record

### File List
- `server/scripts/merge-attendance.js` — new merge-and-relink script (dry-run by default, `--apply` to write)

### Change Log
- 2026-06-02: Wrote `merge-attendance.js`. Resolution logic copied verbatim from `preview-attendance-merge.js`. Dry-run verified: Game 1 55→30 (25 collapsed), Game 2 34→32 (2 collapsed), Game 3 32→31 (1 collapsed). 0 unresolved, 0 flags. Numbers match the previously validated preview output exactly (Mammon/Yusuf Game 1 downtime=27 confirms DT-only rule working).

### Completion Notes
Script written and dry-run verified. All ACs will be satisfied once the user runs `--apply`. The script prints a post-apply verification table (unmatched should be 0, duplicates should be 0). Game 4 guard is in place. Do NOT run `--apply` without user instruction.
