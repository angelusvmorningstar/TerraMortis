---
title: 'Sorcery cost + target picker — derive rite cost from rank everywhere; persist target type-only clicks'
type: 'fix'
created: '2026-04-30'
status: review
recommended_model: 'sonnet — extract a single rite-cost helper, replace stored-cost reads with derived reads at three display surfaces, plus a one-line guard removal in the sorcery target collector'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/editor/sheet.js
  - public/js/tabs/downtime-form.js
  - public/js/admin/downtime-views.js
  - scripts/apply-rite-transcriptions.py
  - docs/merits/Merits Errata.md
---

## Intent

**Problem:** Three related sorcery bugs from the live DT 2 form review (2026-04-30):

1. **T12 — Cruac rite cost shows "3" everywhere.** `public/js/editor/sheet.js:656-659` renders the rite drawer's cost line by reading `ruleEntry.cost` from the rule cache. The seeded rules collection has `cost: "3"` (or similar wrong value) on every Cruac rite — bad import data per `seed-purchasable-powers.js:131` reading `entry.c` from a now-gitignored source file. VtR 2e canon (and `scripts/apply-rite-transcriptions.py:22`) is `1 V` for ranks 1-3, `2 V` for ranks 4-5. Theban is `1 WP` per cast.

2. **T15 — DT form rites section "Stats" line is inconsistent with the vitae projection panel below it.** `public/js/tabs/downtime-form.js:3791` reads `rite.stats` (a legacy field on the character power) for the Stats line. New rites pushed via `shAddRite` (`editor/edit.js:873`) carry no `stats` field, so the row simply doesn't render. Older characters have a baked-in `stats` string from a previous import that may show wrong cost. Meanwhile the DT vitae projection panel further down the same page (`downtime-form.js:5683`) and the admin feeding tally (`admin/downtime-views.js:8069`) both correctly derive cost from rank. So the player sees a Stats line saying one thing and a vitae projection saying another — same page.

3. **T14 — Sorcery target picker drops type-only clicks.** `public/js/tabs/downtime-form.js:567` collects rite targets via `if (type && value) arr.push({type, value});`. When the player clicks a target-type radio (Character / Territory / Other), the value sub-picker only renders on the next pass — value is empty, the row gets dropped, the array is saved empty, the form re-renders with no type selected. The click appears to do nothing. Project / sphere / status target pickers all work correctly because they store type and value as separate top-level keys, surviving partial state across round-trips.

Three bugs converge on a single ST → player UX outcome: sorcery feels broken in DT 2.

**Approach:** Two coordinated changes:

1. **Extract a canonical rite-cost helper** that returns a structured cost object derived from rank + tradition. Replace the three downstream readers (sheet drawer, DT rites Stats line, admin feeding tally — and the DT vitae projection — though the last two already compute correctly, consolidate them on the helper to prevent future drift). The stored `ruleEntry.cost` field is no longer read by display surfaces; legacy `rite.stats` field is no longer trusted.

2. **One-line guard removal** in the sorcery target collector. Drop the `&& value` guard so type-only rows persist as `{type, value: ''}`. The renderer at `downtime-form.js:3800` already handles the type-only fallback case correctly — once persistence stops destroying the click, the existing render path lights up.

This story does not touch the seeded `ruleEntry.cost` data in MongoDB. After this story ships, that field becomes vestigial and unused. A separate cleanup story can purge it later if desired; for now, leaving it harmless costs nothing.

## Boundaries & Constraints

**Always:**
- Single source of truth for "rite cost from rank + tradition" lives in `public/js/data/accessors.js`. Helper signature: `riteCost(rite) → { vitae: number, wp: number, label: string }`. Pure function. Defensive against missing `tradition` or `level`.
- Display surfaces (sheet drawer, DT Stats line) call the helper for their string. Calc surfaces (DT vitae projection, admin feeding tally) call the helper for the numeric values. Same helper, different fields read.
- Cost derivation: `Cruac` + `level >= 4` → `vitae: 2, wp: 0, label: '2 V'`. `Cruac` + `level 1-3` → `vitae: 1, wp: 0, label: '1 V'`. `Theban` (any level) → `vitae: 0, wp: 1, label: '1 WP'`. Unknown tradition or level 0 → `vitae: 0, wp: 0, label: ''`.
- Per-rite offering text (`ruleEntry.offering` from the rules DB) is preserved on the sheet drawer. The cost line shows `${label} & ${offering}` if an offering is present, just as it does today.
- The legacy `rite.stats` field on character powers is left untouched on the document. Display layers stop reading it; old data is not migrated, not deleted.
- Sorcery target picker collector retains the `arr.push({type, value: ''})` only for rows where type is set. Rows with both type and value empty are still dropped (no "phantom rows" persisted).

**Ask First:**
- **Whether to also delete the seeded `cost` field from `rule` docs in MongoDB** (the "3" data) as part of this story. Not strictly necessary — once display readers stop using it, it's harmless dead data. Story default: leave it. Flag this as a follow-up if you want a cleanup script.
- **Whether the sheet drawer's cost line should ever show a Theban rite as `1 WP` even though Theban rites don't deduct vitae from the feeding tally.** Story default: yes — the cost line reflects what the rite *costs to cast*, not what the feeding pool deducts. Players need to know they spend 1 WP to cast. Confirm this is the intended display.

**Never:**
- Do not modify `ruleEntry.cost` reads anywhere they're used for *non-display* purposes. There aren't any today — `ruleEntry.cost` is only read at `sheet.js:657`. But be defensive in the swap.
- Do not change the seeded rule documents in MongoDB. Display surfaces stop reading `cost`; data fix is out of scope.
- Do not change `rite.stats` write paths. Old characters keep their legacy field; new rites stay statless. Display drops it from the rites Stats line.
- Do not change the project / sphere / status target pickers. They already work — separate type/value keys per ADR pattern.
- Do not refactor `renderTargetPicker` or its caller hierarchy. T14 is one guard removal in the collector; nothing else needed.

## I/O & Edge-Case Matrix

| Scenario | Pre-fix | Post-fix |
|---|---|---|
| Sheet rite drawer for "Pangs of Proserpina" (Cruac rank 1) | Cost line shows "Cost: 3" (bad seed data) | Cost line shows "Cost: 1 V" |
| Sheet rite drawer for "Theft of Vitae" (Cruac rank 4) | Cost line shows "Cost: 3" or whatever the seed has | Cost line shows "Cost: 2 V" |
| Sheet rite drawer for a Theban rite | Cost line shows seed value (probably wrong) | Cost line shows "Cost: 1 WP" |
| Sheet rite drawer with rite that has an offering field set | Cost line shows "Cost: 3 & {offering}" | Cost line shows "Cost: 1 V & {offering}" |
| DT form rites Stats line for a newly-added rite (no `rite.stats`) | No Stats line renders | Stats line renders with derived cost: "Cost: 1 V • Tradition/Level: Cruac 1" or similar |
| DT form rites Stats line for an old character with baked-in `rite.stats: "Cost: 1 V 1 Successes • Pool: 6 • Ritual • Scene"` | Renders the legacy string verbatim | Replaces with derived cost; legacy string ignored |
| DT vitae projection panel for char with rank-1 and rank-4 Cruac rites | Already correct (`>= 4 ? 2 : 1`) | Same numbers, but read via helper for consolidation |
| Admin feeding tally vitae cost | Already correct | Same numbers, but read via helper |
| Sorcery target picker: player clicks Character radio | Row dropped (value empty), array persisted as []; re-render shows no type selected | Row persists as `{type: 'character', value: ''}`; re-render shows Character radio selected and the character sub-picker visible |
| Sorcery target picker: player clicks Character then picks "Iseult" from the dropdown | Pre: type-only click was destroyed; selecting Iseult does nothing because no row exists. Post: row persists with `{type: 'character', value: ''}`; selecting Iseult updates value | `{type: 'character', value: 'iseult-id'}` saved; renders correctly on next load |
| Sorcery target picker: player adds a second target row | Same bug applies to row index 1 | Same fix applies; both rows persist independently |
| Sorcery target picker: player clicks Other radio without typing in the textarea | Row dropped | Row persists as `{type: 'other', value: ''}`; Other text input renders empty; player can type later |
| Sorcery target picker: row left fully empty (no type, no value) | Not persisted | Not persisted (no change — type still required to keep a row) |
| Submission shape on save: legacy already-published rite with `target` (singular string) | Renders as `[{type: 'other', value: <string>}]` per existing fallback at line 3800 | Same — fallback path unchanged |

## Code Map

### New helper: `public/js/data/accessors.js`

Add near the existing skill / merit accessors:

```js
/**
 * Derive a rite's casting cost from its tradition and rank.
 * Cruac rites: 1 V at rank 1-3, 2 V at rank 4-5.
 * Theban rites: 1 WP per cast (regardless of rank).
 *
 * @param {object} rite - either a character power doc ({tradition, level}) or
 *                        a rule doc ({parent, rank}). Both shapes accepted.
 * @returns {{vitae: number, wp: number, label: string}}
 */
export function riteCost(rite) {
  if (!rite) return { vitae: 0, wp: 0, label: '' };
  // Accept either character-power shape ({tradition, level}) or rule-doc shape ({parent, rank})
  const tradition = rite.tradition || rite.parent || '';
  const rank = rite.level || rite.rank || 0;
  if (tradition === 'Cruac') {
    const v = rank >= 4 ? 2 : rank >= 1 ? 1 : 0;
    return { vitae: v, wp: 0, label: v ? `${v} V` : '' };
  }
  if (tradition === 'Theban' || tradition === 'Theban Sorcery') {
    const wp = rank >= 1 ? 1 : 0;
    return { vitae: 0, wp, label: wp ? '1 WP' : '' };
  }
  return { vitae: 0, wp: 0, label: '' };
}
```

### Site 1: Sheet rite drawer — `public/js/editor/sheet.js:656-659`

Currently:
```js
const ruleEntry = getRulesByCategory('rite')?.find(r => r.name === p.name);
const baseCost = ruleEntry?.cost ?? null;
const riteOffering = ruleEntry?.offering ?? null;
const costLine = baseCost ? (riteOffering ? baseCost + ' & ' + riteOffering : baseCost) : null;
```

After:
```js
const ruleEntry = getRulesByCategory('rite')?.find(r => r.name === p.name);
const baseCost = riteCost(p).label;  // derive from rank, ignore ruleEntry.cost
const riteOffering = ruleEntry?.offering ?? null;
const costLine = baseCost ? (riteOffering ? baseCost + ' & ' + riteOffering : baseCost) : null;
```

Add `riteCost` to the import block at the top of the file (look for the existing accessors import — `getRulesByCategory` is already imported, just add `riteCost` from `'../data/accessors.js'` if not already imported).

### Site 2: DT form rites Stats line — `public/js/tabs/downtime-form.js:3788-3792`

Currently:
```js
if (rite) {
  h += '<div class="dt-sorcery-details">';
  h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Tradition/Level:</span> ${esc(rite.tradition)} ${rite.level}</div>`;
  if (rite.stats) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Stats:</span> ${esc(rite.stats)}</div>`;
  if (rite.effect) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Effect:</span> ${esc(rite.effect)}</div>`;
```

After:
```js
if (rite) {
  h += '<div class="dt-sorcery-details">';
  h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Tradition/Level:</span> ${esc(rite.tradition)} ${rite.level}</div>`;
  const costLabel = riteCost(rite).label;
  if (costLabel) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Cost:</span> ${esc(costLabel)}</div>`;
  if (rite.effect) h += `<div class="dt-sorcery-stat"><span class="dt-sorcery-label">Effect:</span> ${esc(rite.effect)}</div>`;
```

The `Stats:` line is replaced with a `Cost:` line showing the derived value. The legacy `rite.stats` read is gone. The `rite.effect` line is preserved (it's still a useful display for older characters where rule descriptions weren't loaded).

Add `riteCost` to the imports at the top of the file (already imports from `'../data/accessors.js'`; just add to the destructured list).

**Optional consolidation** (if scope allows): the DT vitae projection at `tabs/downtime-form.js:5675-5686` currently has its own `>=4 ? 2 : 1` formula. Replace with a `riteCost(rite).vitae` call:

Currently (around line 5683):
```js
const rite = rites.find(r => r.name === riteName);
if (rite && rite.tradition === 'Cruac') {
  riteVitaeCost += (rite.level || 0) >= 4 ? 2 : 1;
}
```

After:
```js
const rite = rites.find(r => r.name === riteName);
if (rite) {
  riteVitaeCost += riteCost(rite).vitae;  // 0 for Theban, 1 or 2 for Cruac
}
```

This drops the `tradition === 'Cruac'` guard because the helper handles non-Cruac → 0 vitae. Equivalent behaviour, less local logic.

### Site 3: Admin feeding tally — `public/js/admin/downtime-views.js:8058-8086` (consolidation)

Two existing helpers, both correct, both with their own per-rite formula. Consolidate on the canonical helper.

`_computeRiteVitaeCost(sub, char)` at line 8058:
```js
function _computeRiteVitaeCost(sub, char) {
  const subChar = char || findCharacter(sub.character_name, sub.player_name);
  const discs = subChar?.disciplines || {};
  if (!discs.Cruac) return 0;
  const resp = sub.responses || {};
  const count = parseInt(resp['sorcery_slot_count'] || '1', 10);
  let total = 0;
  for (let n = 1; n <= count; n++) {
    const rite = resp[`sorcery_${n}_rite`];
    if (!rite) continue;
    const level = _getRiteLevel(rite) || 0;
    total += level >= 4 ? 2 : level >= 1 ? 1 : 0;  // ← replace with helper
  }
  return total;
}
```

After (replace inner cost formula):
```js
total += riteCost({ tradition: 'Cruac', level }).vitae;
```

`_computeRiteWpCost(sub, char)` at line 8075:
```js
total += riteCost({ tradition: 'Theban', level: 1 }).wp;  // simplifies the per-rite increment
```
(Or leave the increment-by-one — both are correct; pick the cleaner read. The Theban "1 WP per cast regardless of rank" rule is preserved either way.)

Add `riteCost` to imports in `admin/downtime-views.js`. The file currently imports many things; check for an existing `from '../data/accessors.js'` line and add to it; if no such import line exists, add a new one.

### Site 4: Sorcery target collector — `public/js/tabs/downtime-form.js:559-569`

Currently:
```js
const targetsBlock = document.querySelector(`[data-sorcery-slot-targets="${n}"]`);
if (targetsBlock) {
  const arr = [];
  targetsBlock.querySelectorAll('.dt-sorcery-target-row').forEach((row, ti) => {
    const typeEl = row.querySelector(`input[name="dt-sorcery_${n}_targets_${ti}_type"]:checked`);
    const valEl  = row.querySelector(`#dt-sorcery_${n}_targets_${ti}_value`);
    const type = typeEl ? typeEl.value : '';
    const value = valEl ? (valEl.value || '').trim() : '';
    if (type && value) arr.push({ type, value });  // ← bug: drops type-only rows
  });
  responses[`sorcery_${n}_targets`] = arr;
}
```

After:
```js
const targetsBlock = document.querySelector(`[data-sorcery-slot-targets="${n}"]`);
if (targetsBlock) {
  const arr = [];
  targetsBlock.querySelectorAll('.dt-sorcery-target-row').forEach((row, ti) => {
    const typeEl = row.querySelector(`input[name="dt-sorcery_${n}_targets_${ti}_type"]:checked`);
    const valEl  = row.querySelector(`#dt-sorcery_${n}_targets_${ti}_value`);
    const type = typeEl ? typeEl.value : '';
    const value = valEl ? (valEl.value || '').trim() : '';
    if (type) arr.push({ type, value });  // persist type-only rows; renderer handles empty value
  });
  responses[`sorcery_${n}_targets`] = arr;
}
```

The renderer at line 3800 already handles `{type: 'X', value: ''}` — it renders the type radio as selected and the appropriate sub-picker (Character chips / Territory pills / Other text input) empty. No render change needed.

### Optional: clean up the `getXpCost` rite branch

`tabs/downtime-form.js` `getXpCost` at line 3355 currently returns a hardcoded `4` for rites:
```js
case 'rite': return 4;
```

This is the XP cost (separate from in-game vitae cost). VtR 2e house rule per `editor/xp.js:137`: rank 1-3 rites cost 1 XP, rank 4-5 cost 2 XP. The current `return 4` is wrong (also out of scope for T12/T14/T15 specifically — but worth flagging while we're in the area). **Defer to dtlt-4 or a follow-up; do not change in this story.**

## Tasks & Acceptance

**Execution:**

- [ ] Add `riteCost(rite)` helper to `public/js/data/accessors.js` per the Code Map signature.
- [ ] Sheet rite drawer (`public/js/editor/sheet.js:657`): replace `ruleEntry?.cost` with `riteCost(p).label`. Update import.
- [ ] DT form rites Stats line (`public/js/tabs/downtime-form.js:3791`): replace `if (rite.stats)` block with `if (costLabel)` showing derived cost. Add `riteCost` import.
- [ ] DT vitae projection (`public/js/tabs/downtime-form.js:5683`): replace inline `>= 4 ? 2 : 1` with `riteCost(rite).vitae` (consolidation; behavior preserved).
- [ ] Admin feeding tally (`public/js/admin/downtime-views.js:8058-8086`): replace inline cost formulas in `_computeRiteVitaeCost` and `_computeRiteWpCost` with `riteCost(...)` calls. Add import.
- [ ] Sorcery target collector (`public/js/tabs/downtime-form.js:567`): change `if (type && value)` → `if (type)`.
- [ ] Manual smoke per Verification.

**Acceptance Criteria:**

- **T12 — sheet drawer cost:**
  - Given a Cruac rank-1 rite on a character sheet, when the rite drawer is opened, then the cost line reads "Cost: 1 V".
  - Given a Cruac rank-4 rite, when the drawer is opened, then the cost line reads "Cost: 2 V".
  - Given a Theban rite, when the drawer is opened, then the cost line reads "Cost: 1 WP".
  - Given a rite with both a derived cost and an `offering` field, when the drawer is opened, then the cost line reads "Cost: 1 V & {offering text}".
  - Given the rules cache is empty (offline / pre-load state), when the drawer is opened, then the cost line still renders the derived cost (helper does not depend on the rule cache).
- **T15 — DT rites Stats line cost:**
  - Given a player picks a rite in the DT form, when the rite-details block renders, then a "Cost:" line appears showing the derived value (e.g. "1 V" / "2 V" / "1 WP"), independent of whether `rite.stats` is set on the character power.
  - Given a character with a legacy `rite.stats` baked-in (older import), when the rite-details block renders, then the legacy string is NOT shown; the derived cost replaces it.
  - Given the same player scrolls down to the vitae projection panel, when the projected cost is shown for the same rite, then the projected vitae cost matches the Stats-line cost (no within-page disagreement).
- **T14 — sorcery target picker persists type-only:**
  - Given a player opens a DT form rite slot and clicks the "Character" target type radio, when the form re-renders, then the Character radio is selected AND the character sub-picker (chip grid or dropdown) is visible.
  - Given the same flow with "Territory", when re-render completes, then the territory pills are visible.
  - Given the same flow with "Other", when re-render completes, then the Other text input is visible.
  - Given the player picks Character then selects a character from the sub-picker, when the form saves, then `sorcery_N_targets` contains `[{type: 'character', value: '<character-id>'}]`.
  - Given the player adds a second target row and clicks Territory in the new row, when the form re-renders, then both rows persist independently with their own type and value.
  - Given a row with both type and value empty (no radio clicked, no value entered), when the form saves, then the row is NOT persisted.
- **Consolidation (no behavioural change):**
  - Given the DT vitae projection has been wired to `riteCost(...).vitae`, when a character with rank-1 + rank-4 Cruac rites is rendered, then the projected vitae cost matches pre-fix exactly (1 + 2 = 3).
  - Given the admin feeding tally for the same submission, when ST processing renders, then the rite-cost row matches the projection.

## Verification

**Commands:**

- No new tests required (consolidation refactor + one-line guard removal). Existing suites should remain green:
  - `cd server && npx vitest run` — green.
  - Open browser console for the player DT form and admin sheet — no thrown errors during render or interaction.

**Manual checks:**

1. **Sheet drawer cost:**
   - Open a character with at least one Cruac rite at rank 1-3. Open the rite drawer. Confirm cost line shows "1 V".
   - Same character, rank 4-5 rite. Confirm "2 V".
   - Character with a Theban rite. Confirm "1 WP".
   - Rite with an offering field set in the rules DB. Confirm "1 V & {offering}".
2. **DT form rites Stats line:**
   - Open the DT form for a character with rites. Pick a Cruac rank-1 rite from the dropdown. Confirm a "Cost:" line appears reading "1 V" (no Stats line).
   - Same player: scroll down to the Vitae Projection panel. Confirm "Cruac Rites: −1" matches the cost shown above.
   - Switch to a rank-4 rite. Confirm "Cost: 2 V" and projection updates to −2.
   - Switch to a Theban rite. Confirm "Cost: 1 WP" and projection vitae unaffected (Theban deducts WP not V).
   - Pick a character with a legacy `rite.stats` field on one of their power entries (older character data). Confirm the new "Cost:" line replaces it; legacy string does NOT render.
3. **Sorcery target picker:**
   - Open DT form, navigate to a sorcery slot, pick any rite. Click "Character" target type. Confirm the radio appears selected AND the character chip grid/dropdown is visible. Try clicking "Territory" — confirm radio swaps and territory pills appear. Try "Other" — confirm Other text input appears.
   - Pick "Character" → select Iseult → save form → reload. Confirm Iseult is still selected on reload.
   - Click "+ Add target". Confirm a second row appears. Pick a different type in the second row; confirm both rows persist independently.
   - Click "×" on a target row; confirm it's removed and other rows remain unchanged.
4. **No regression:**
   - Open the admin DT processing view for an existing submission with sorcery slots. Confirm the rite cost row matches what the player saw in their projection.
   - Open a character sheet that's been working pre-fix (Eve, for example). Confirm no rendering changes outside the rite cost line.

## Final consequence

The four sorcery cost surfaces converge on a single derivation: `riteCost(rite)` based on tradition + rank. The seeded `cost` field in the rules collection becomes vestigial (no display reads it). `rite.stats` on character powers becomes vestigial (no display reads it for the rites Stats line). Cleanup of either is a follow-up if desired; not required for this story.

Players and STs see the same cost everywhere on the page. The sorcery target picker stops eating clicks. Three of the eight sorcery findings from the live DT 2 review (T12, T14, T15) are closed.

The next sorcery-adjacent issue (Mandragora fruit conditionality, T13 / dtlt-10) is independent and stays blocked on ST ruling. The XP-cost-of-rites issue (incorrect `getXpCost` returning 4 instead of rank-derived) is flagged in Code Map but deferred — out of scope for this story; can be folded into dtlt-4 or a separate follow-up.
