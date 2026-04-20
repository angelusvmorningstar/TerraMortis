# Story DT-Fix-15: Rite Vitae Cost Auto-Population

## Status: done

## Story

**As an** ST processing downtime feeding,
**I want** the rite cost field in the vitae tally to be pre-populated from the character's submitted sorcery rites,
**so that** I don't have to manually look up and enter vitae costs that can be derived from the submission data.

## Background

The vitae tally panel in feeding processing (`_renderFeedRightPanel`) already has a "Rite costs" row with a manual number input (`proc-rite-cost-input`) that subtracts from the Final Vitae total. The `vitae_rite_cost` value is stored in `feeding_review` via `saveEntryReview`.

Currently the field always starts at 0 and the ST must type in the cost by hand. The sorcery submission data contains all the information needed to compute this automatically:
- Rite names are in `sub.responses.sorcery_N_rite`
- Rite levels can be looked up via the existing `_getRiteLevel(riteName)` helper (line ~6571)
- Tradition is detectable from the character's disciplines

**Cost rules:**
- Cruac rites level 1–3: **1 Vitae** per rite
- Cruac rites level 4–5: **2 Vitae** per rite
- Theban rites: **1 Willpower** per rite (does NOT reduce vitae total — informational only)

---

## Acceptance Criteria

1. When the feeding panel renders and `rev.vitae_rite_cost` has not been manually set (`=== undefined`), the rite cost input is pre-populated with the auto-computed Cruac vitae cost from submitted sorcery rites.
2. If the ST has previously saved a manual value (`rev.vitae_rite_cost !== undefined`), that stored value is shown — the auto-computed value does not override it.
3. The vitae total correctly reflects the pre-populated rite cost (Final Vitae decreases by the auto-computed amount for Cruac casters).
4. If any Theban rites are present in the submission, a read-only informational row appears in the vitae tally showing the total WP cost (e.g. "Theban Sorcery — 2 WP"). The row is labelled to make clear it does not affect the vitae total.
5. If a rite's level cannot be determined (not in rules DB and not in any character's powers), it contributes 0 to the auto-computed cost and the ST's manual field remains editable for correction.
6. Characters with no sorcery submission data show 0 in the rite cost field (no change from current behaviour).

---

## Tasks / Subtasks

- [x] Task 1: Add `_computeRiteVitaeCost(sub)` helper
  - [x] 1.1–1.5: Implemented above `_getRiteLevel`; guards on `discs.Cruac`, iterates slots, uses `_getRiteLevel`, applies level≥4→2v else 1v rule

- [x] Task 2: Add `_computeRiteWpCost(sub)` helper
  - [x] 2.1–2.3: Implemented above `_getRiteLevel`; guards on `discs['Theban Sorcery'] || discs.Theban`, counts non-empty rite slots

- [x] Task 3: Pre-populate rite cost input in `_renderFeedRightPanel`
  - [x] 3.1–3.3: `feedSubForRite` + `computedRiteCost` computed; `vitaeRite` uses stored value if set, computed value otherwise; both input `value` and `finalVitae` use the resolved `vitaeRite`

- [x] Task 4: Add Theban WP informational row
  - [x] 4.1–4.4: `wpCost` computed via `_computeRiteWpCost`; row rendered after Rite costs row only when `wpCost > 0`; `(vitae unaffected)` label via `proc-mod-muted` span

---

## Dev Notes

### Key files

| File | Scope |
|------|-------|
| `public/js/admin/downtime-views.js` | All changes; single-file codebase |

### Existing helpers to reuse — DO NOT reinvent

- **`_getRiteLevel(riteName)`** — line ~6571. Checks rules DB first (`_getRulesDB()`), then scans all `characters[].powers` for `{ category: 'rite', name: riteName }`. Returns level (1–5) or `null`. Use this exactly as-is.
- **`_computeRitePool(char, attr, skill, disc)`** — line ~6587. Not needed here but nearby; don't confuse with the new helper.
- **`findCharacter(name, playerName)`** — global lookup. Use to get the character document for tradition detection.
- **`saveEntryReview(entry, patch)`** — async. The existing blur handler on `proc-rite-cost-input` already calls this with `{ vitae_rite_cost: val }` on blur (line ~3652–3658). Do NOT add an extra save call in Task 3 — the blur handler is sufficient.

### Tradition detection

The submission itself does not store tradition directly. Derive it from the character's disciplines:
```js
const subChar = findCharacter(sub.character_name, sub.player_name);
const discs = subChar?.disciplines || {};
const isCruac  = !!(discs.Cruac);
const isTheban = !!(discs['Theban Sorcery'] || discs.Theban);
```
If neither tradition is detected (Unknown), all rites default to 0 cost (cannot determine — ST adjusts manually).

### Cost formula

```js
function _computeRiteVitaeCost(sub) {
  // Only Cruac rites cost vitae
  // Theban rites cost WP (handled separately)
  const subChar = findCharacter(sub.character_name, sub.player_name);
  const discs = subChar?.disciplines || {};
  if (!discs.Cruac) return 0; // Theban or Unknown = no vitae cost
  const resp = sub.responses || {};
  const count = parseInt(resp['sorcery_slot_count'] || '1', 10);
  let total = 0;
  for (let n = 1; n <= count; n++) {
    const rite = resp[`sorcery_${n}_rite`];
    if (!rite) continue;
    const level = _getRiteLevel(rite) || 0;
    total += level >= 4 ? 2 : level >= 1 ? 1 : 0;
  }
  return total;
}
```

### Vitae panel render patch (Task 3)

The patch targets `_renderFeedRightPanel`, specifically around line 5428–5433:

```js
// BEFORE:
const vitaeRite = rev.vitae_rite_cost !== undefined ? rev.vitae_rite_cost : 0;

// AFTER:
const feedSubForRite = submissions.find(s => s._id === entry.subId);
const computedRiteCost = feedSubForRite ? _computeRiteVitaeCost(feedSubForRite) : 0;
const vitaeRite = rev.vitae_rite_cost !== undefined ? rev.vitae_rite_cost : computedRiteCost;
```

The `vitaeRite` variable is then used for both `finalVitae` (line ~5433) and the input field `value="${vitaeRite}"` (line ~5473). Both get the right value without further changes.

### Theban WP row placement

Insert after the existing "Rite costs" row (line ~5474) and before the "Manual adj." ticker row. Pattern matches existing `proc-mod-row`:

```js
if (wpCost > 0) {
  h += `<div class="proc-mod-row">`;
  h += `<span class="proc-mod-label">Theban Sorcery <span class="proc-mod-muted">(vitae unaffected)</span></span>`;
  h += `<span class="proc-mod-val proc-mod-neg">\u2212${wpCost}\u202FWP</span>`;
  h += `</div>`;
}
```

The `proc-mod-muted` class is already defined in the stylesheet (used in Feeding Grounds row).

### No test framework

This project has no automated test suite. Manual verification in-browser is the only validation path. The dev agent should describe what to check in Completion Notes.

### No regressions to watch

- The existing blur handler on `proc-rite-cost-input` must continue to save user-edited values. This story does NOT touch the blur handler.
- `_updateVitaeTotal` reads `proc-rite-cost-input` value live — it already handles the pre-populated value correctly since it just reads the DOM value.
- Characters without sorcery: `sorcery_slot_count` defaults to `'1'`, but `sorcery_1_rite` will be empty — the loop skips empty rites (`if (!rite) continue`). Result: 0 cost, no change.

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- Both helpers placed immediately above `_getRiteLevel` so `_computeRiteVitaeCost` can call it without forward-reference issues.
- `_computeRiteVitaeCost` returns 0 for Theban/Unknown characters — ST edits the field manually if needed.
- `vitaeRite` used unchanged for both `finalVitae` and the input `value`; existing blur handler and `_updateVitaeTotal` require no changes.
- Verify: open a Cruac character's feeding panel → Rite costs should pre-fill; open a Theban character's panel → WP info row appears, Rite costs stays 0; reload → manual override persists.

### File List
- `public/js/admin/downtime-views.js`

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-04-15 | 1.0 | Initial draft | Bob (SM) + Angelus |
