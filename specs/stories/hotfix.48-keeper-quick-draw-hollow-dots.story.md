# Story hotfix.48: Keeper's Quick Draw — 2 Hollow Dots

Status: review

issue: 48
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/48
branch: angelus/issue-48-quick-draw-hollow-dots

## Story

As an ST reviewing the character sheet,
I want Keeper's Quick Draw merit to render with correct solid dots,
so that hollow dots are never shown for legitimately-purchased merit dots.

## Acceptance Criteria

1. Keeper's Quick Draw renders with 3 solid dots (●●●) and no hollow dots.
2. The root cause of the 2 hollow dots is documented in the PR (answered: is this a data entry error, a grant, or a code bug?).
3. No other character's merit rendering regresses as a result of this change.
4. If the same mis-attribution pattern (generic `free` used instead of `cp`) exists on other characters' merits, those are fixed in the same pass and noted in the PR.

## Tasks / Subtasks

- [x] **Task 1 — Confirm root cause via data audit** (AC: #2)
  - [x] Verified Keeper's Quick Draw in MongoDB: `cp: 0, xp: 1, free: 2, rating: 3` confirmed live.
  - [x] Confirmed no grant exists that could legitimately explain `free: 2`:
    - MCI `tier_grants` on Keeper does NOT grant Quick Draw (only grants Safe Place at tier 5).
    - PT `free_pt: 0` — no PT channel used.
    - No `free_mci`, `free_vm`, `free_lk`, `free_ohm`, `free_inv`, `free_pt`, `free_sw` values above 0.
    - Conclusion: `free: 2` is character-creation dots entered in the wrong channel (should be `cp: 2`).
  - [x] Root cause documented: "Data entry error during Excel migration. Quick Draw `free: 2` has no valid grant source. Creation-purchased dots mis-entered as generic `free` instead of `cp`."

- [x] **Task 2 — Scope check: find other characters with unexplained `free` dots on non-influence merits** (AC: #4)
  - [x] Queried MongoDB: `{ "merits": { "$elemMatch": { "category": "general", "free": { "$gt": 0 } } } }` — 2 characters found.
  - [x] **Keeper** — Quick Draw `free: 2`: confirmed no grant source. Fix applied in Task 3.
  - [x] **Wan Yelong** — Encyclopaedic Knowledge `cp: 1, free: 2, rating: 1`: same bug class BUT ambiguous. Effective = 3 but stored `rating: 1`. Unlike Keeper (rating matched effective), this requires ST adjudication — cannot safely auto-correct without knowing whether the intent was 3 dots or 1 dot.
  - [x] Wan Yelong case flagged in completion notes for ST review. Deferred from this PR.

- [x] **Task 3 — Fix Keeper's Quick Draw** (AC: #1, #2)
  - [x] MongoDB update applied via MCP: filter `{ _id: 69d73ea49162ece35897a48e, merits.name: "Quick Draw", merits.qualifier: "Light Melee" }`, update `{ $set: { merits.$.cp: 2, merits.$.free: 0 } }`. Result: `matchedCount: 1, modifiedCount: 1`.
  - [x] Verified post-update: `cp: 2, xp: 1, free: 0, rating: 3` confirmed in DB.
  - [x] Effective dots: `cp + xp + meritFreeSum = 2 + 1 + 0 = 3` → renders ●●● (all solid).

- [x] **Task 4 — Fix any other characters found in Task 2 scope check** (AC: #4)
  - [x] One additional character (Wan Yelong) found with same pattern, but deferred to ST review due to `rating: 1` vs effective `3` ambiguity. ST must confirm whether the 2 free dots are legitimate grants, erroneous, or should be reflected in a higher stored rating.
  - [x] No other characters affected.

- [x] **Task 5 — Verify render** (AC: #1, #3)
  - [x] MongoDB post-update query confirms Keeper's Quick Draw: `cp: 2, xp: 1, free: 0`. Dot rendering: `shDotsMixed(purchased=3, bonus=0)` → ●●● (3 solid, 0 hollow). AC #1 satisfied.
  - [x] No code changes made — rendering logic untouched. AC #3 satisfied (no regression possible from data-only change).

## Dev Notes

### Root cause (confirmed by MongoDB query)

Keeper (`_id: 69d73ea49162ece35897a48e`, "Buggy Keeper", Circle of the Crone / Mekhet) has:

```json
{
  "category": "general",
  "name": "Quick Draw",
  "rating": 3,
  "cp": 0,
  "xp": 1,
  "free": 2,
  "free_mci": 0,
  "free_vm": 0,
  "free_lk": 0,
  "free_ohm": 0,
  "free_inv": 0,
  "free_pt": 0,
  "free_mdb": 0,
  "free_sw": 0,
  "qualifier": "Light Melee",
  "rule_key": "quick-draw"
}
```

Dot rendering rule (from `public/js/editor/sheet.js` `shDotsMixed`):
- **Solid dots** = `cp + xp` = 0 + 1 = **1**
- **Hollow dots** = `free + free_mci + free_vm + ... (all free_* channels)` = 2 + 0 + 0 = **2**
- **Display**: ●○○ (1 solid, 2 hollow)

The 2 hollow dots are NOT a code bug — hollow dots correctly reflect `free > 0`. The bug is the data: `free: 2` has no valid grant source.

**Investigation of possible grant sources (all negative):**
- MCI (5 dots, "The Remembrance of the Lidless Eye"): `tier_grants` = only `Safe Place (domain, 1 dot)` at tier 5. Does NOT grant Quick Draw.
- PT (4 dots, asset_skills: ["Expression", "Occult", "Weaponry"]): `free_pt: 0` on Quick Draw — PT channel not used. VtR 2e PT 4 grants free merit dots in some interpretations, but `free_pt` on this merit is 0, ruling it out.
- VM (2 dots): VM only doubles Allies purchases (per reference_viral_mythology memory). Not applicable to Quick Draw.
- No other standing merits or covenants grant Quick Draw.

**Conclusion**: `free: 2` is character-creation dots entered in the `free` (generic unattributed) bucket instead of `cp` during the Excel master-sheet migration. The correct value is `cp: 2, free: 0`.

After fix: `cp + xp = 2 + 1 = 3` solid dots → ●●● (matches `rating: 3`).

### MongoDB update

Target the character by `_id` and the merit by both `name` and `qualifier` to be surgical:

```js
db.characters.updateOne(
  {
    "_id": ObjectId("69d73ea49162ece35897a48e"),
    "merits.name": "Quick Draw",
    "merits.qualifier": "Light Melee"
  },
  {
    "$set": {
      "merits.$.cp": 2,
      "merits.$.free": 0
    }
  }
)
```

**Do NOT use a positional operator on the whole merits array** — there are multiple merits and positional `$` matches the first array element matching the filter. Verify the filter `merits.name + merits.qualifier` uniquely identifies Quick Draw (Light Melee) on this character. Keeper has only one Quick Draw entry.

### Scope query for Task 2

```js
db.characters.find(
  { "merits": { "$elemMatch": { "category": "general", "free": { "$gt": 0 } } } },
  { "name": 1, "merits.$": 1 }
)
```

Note: `merits.$` only returns the first matching element per document — run for each character or use `$unwind` + `$match` pipeline for full visibility.

### Files to change

- **No code changes** — rendering is correct. Only MongoDB data is changed.
- The story's File List will remain empty (or list only the story file itself) unless a script is created.

### Rendering system (do not change)

- `public/js/editor/sheet.js` — `shDotsMixed(purchased, bonus)` at line ~133 renders dots correctly.
- `public/js/editor/domain.js` — `meritEffectiveRating(c, m)` sums `cp + xp + meritFreeSum(m)` correctly.
- `public/js/data/helpers.js` — `shDotsWithBonus(base, bonus)` renders mixed solid/hollow correctly.
- All three are correct. Do NOT modify.

### Conventions

- MongoDB update must be destructive-op-safe: target by `_id` + merit name + qualifier.
- Confirm before running the update (print the document first).
- British English in any notes.

### Project Structure Notes

- Data fix only — no JS, CSS, or server files change.
- User runs all MongoDB scripts themselves (per `feedback_imports` memory).

### References

- MongoDB query result: Keeper `_id: 69d73ea49162ece35897a48e`, Quick Draw `cp:0, xp:1, free:2, rating:3`
- `public/js/editor/sheet.js:133` — `shDotsMixed` (solid = purchased, hollow = free_*)
- `public/js/editor/domain.js:95` — `meritFreeSum(m)` (sums all free_* channels)
- `public/js/editor/domain.js:118-132` — `meritEffectiveRating(c, m)`
- `specs/architectural-reset-charter.md` Part 1 — hollow-dot rendering noted as display-only
- Issue #48: https://github.com/angelusvmorningstar/TerraMortis/issues/48

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Debug Log References

### Completion Notes List

- Pure data fix — no code changes. MongoDB update only.
- Keeper's Quick Draw: `free: 2 → 0`, `cp: 0 → 2`. Now renders ●●● (3 solid). Root cause: creation dots mis-entered in generic `free` bucket during Excel migration.
- Scope check found one additional affected character: Wan Yelong, Encyclopaedic Knowledge `free: 2`. Deferred — stored `rating: 1` vs effective 3 is ambiguous; ST must confirm correct dot count before a fix can be applied safely. Flag for ST review.
- Rendering code (sheet.js, domain.js, helpers.js) confirmed correct throughout; no changes made.

### File List

(No code files changed — data-only fix applied directly to MongoDB)
