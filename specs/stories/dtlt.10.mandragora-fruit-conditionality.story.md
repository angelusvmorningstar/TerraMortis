---
title: 'Mandragora Garden fruit conditionality — gate fruit and maintenance cost on a single switch'
type: 'fix'
created: '2026-04-30'
status: 'awaiting-ruling'
recommended_model: 'sonnet — implementation surface is bounded once the ST ruling lands; both possible readings are laid out below with concrete code-map paths'
context:
  - specs/epic-dtlt-dt2-live-form-triage.md
  - public/js/tabs/downtime-form.js
  - docs/merits/Merits Errata.md
  - C:/Users/angel/.claude/projects/D--Terra-Mortis-TM-Suite/memory/reference_vitae_deficit.md
---

> **⚠ BLOCKED ON ST TEAM RULING.** Two valid readings exist; the dev cannot implement until canon is decided. This story file documents both implementation paths so work can start the moment the ruling lands. **Sprint-status remains `backlog`** until then.

## Intent

**Problem:** Mandragora Garden in the DT vitae projection currently always charges the maintenance vitae cost (`-mandDots`) AND always credits the Blood Fruit production (`+mandDots`), regardless of whether the player is using the garden this cycle. From the live DT 2 form review (2026-04-30): *"Mandragora Garden provides the + Blood Fruit regardless of whether it sustains a rite or not."*

Per the canonical errata at `docs/merits/Merits Errata.md:441`:
> *"Whilst feeding the garden one Vitae per month equal to dots in Mandragora Garden, the garden produces twice that quantity in sap, nectar, or other fluids, which serve as animal blood..."*

The "whilst feeding" is conditional. Opting out of maintenance should suppress both the cost and the fruit. The current code does neither — both fire unconditionally from the merit's existence.

**Two valid readings of "conditional":**

- **Reading A (RAW-aligned):** A single "maintain garden this cycle" toggle on the vitae projection panel gates BOTH the cost and the fruit production. If the player ticks "maintain", they pay -mandDots and gain +bloodFruit. If they don't tick, neither fires. Closest to the errata wording — a player can choose to skip a month of maintenance entirely.
- **Reading B (house-rule, ties to existing sustained-rite UI):** Fruit production is gated on whether ANY rite has `sorcery_${n}_mandragora === 'yes'` (the per-rite "sustained" checkbox at `tabs/downtime-form.js:3766-3784`). The maintenance cost stays linked to the existing per-rite "Vitae cost already paid" checkbox at `:3776-3782`, which already exists for sustained rites. Couples fruit semantically to "the garden is being actively used for sorcery this cycle", not to a generic maintenance flag.

Both readings produce internally consistent UX. RAW favours A. The house-rule reading B leans on existing UI affordances and is closer to the player's current mental model of "you tick mandragora when you cast there".

**Approach:** Wait for ruling. When ruling lands, implement the chosen reading per the matching Code Map path below. Both paths are bounded; both fit in a single PR; both are Sonnet-grade once canon is fixed.

## Boundaries & Constraints

**Always:**
- The cost and the fruit must gate on the SAME condition. Asymmetric gating (e.g. cost always charged, fruit conditional) is the current bug — the fix must restore symmetry.
- The visual breakdown in the vitae projection panel (`:5781-5800`) shows or hides the Mandragora line(s) based on whether the gate fires. When gated off, the Mandragora cost row and the Blood Fruit row both vanish (no zero-rows rendered).
- For Reading A: the new toggle is rendered in the Sorcery section near the existing per-rite Mandragora controls, OR on the vitae projection panel itself. UX placement decision in "Ask First" once ruling is A.
- For Reading B: the existing per-rite `sorcery_${n}_mandragora` and `sorcery_${n}_mand_paid` flags are reused. No new persisted fields.
- The `effectiveDomainDots(c, 'Mandragora Garden')` calc at `:5688` continues to read effective rating (per dtlt-4's effective-rating sweep). The bug fix is gating, not magnitude.
- Backwards-compat: legacy DT 1 and DT 2 submissions that already saved through the unconditional path do not regenerate or re-read with the new gate. The published outcomes for those cycles are immutable. The fix applies to subsequent cycles.

**Ask First (THE BLOCKER):**
- **Which reading is canonical?** A (single maintenance toggle) or B (per-rite sustained checkbox gates fruit; existing "vitae paid" gates cost)? Or hybrid? Story cannot start until this is fixed.
- **(Reading A only) Toggle placement.** Three plausible locations:
  1. Vitae projection panel header — adjacent to the cost row.
  2. Sorcery section, near the per-rite Mandragora checkboxes — semantically grouped with garden controls.
  3. A new field in the form's character-state block (e.g. alongside Bone Cap / Vitae Max).
  Default if A is chosen: option 1 (vitae projection panel).
- **(Reading B only) Cost-paid behaviour.** Today the per-rite "Vitae cost already paid" checkbox at `:3776-3782` is shown only when the rite's mandragora checkbox is ticked. If Reading B is chosen, the cost gate naturally cascades: mandragora unticked → no rite uses garden → cost not charged. Confirm that's the intended semantic. Alternative: split the cost charge per-rite (charge `mandDots` once if any rite uses it, vs charge `mandDots` per sustained rite — though RAW says it's a per-month cost, not per-rite).
- **What happens to characters who own Mandragora Garden but cast no rites this cycle?** Reading A's toggle covers this: they tick "maintain" if they want fruit (and pay cost). Reading B's gate only fires when at least one rite ticks Mandragora — so a non-casting cycle gets no fruit and no cost. That may be unintended for B (a player might want fruit even on a no-rite cycle). Confirm.

**Never:**
- Do not implement Reading A and Reading B simultaneously. They're mutually exclusive — a hybrid would re-introduce the asymmetric-gating bug.
- Do not change the Mandragora `effectiveDomainDots` magnitude logic or the `bloodFruit = mandDots` calculation. The bug is gating; the magnitudes are correct.
- Do not change the per-rite Mandragora bonus-dice grant at `:3771` (`+${mandDots} bonus dice to the casting roll`). That's a separate effect — keep it.
- Do not migrate or alter past submissions. Published outcomes are immutable.
- Do not introduce a separate per-cycle Mandragora maintenance log collection. The flag (whichever path) lives on the submission alongside other DT form responses.

## I/O & Edge-Case Matrix

| Scenario | Reading A behaviour (RAW) | Reading B behaviour (house) |
|---|---|---|
| Char has Mandragora 3, casts no rites, doesn't tick maintain | No -3V cost, no +3 fruit row in projection. | No -3V cost (no rite uses garden), no +3 fruit. Same outcome. |
| Char has Mandragora 3, casts no rites, ticks maintain (Reading A only) | -3V cost, +3 fruit. | n/a — Reading B has no maintain toggle. |
| Char has Mandragora 3, casts 1 Cruac rite WITH garden checkbox ticked | -3V cost, +3 fruit (gated on maintain toggle). | -3V cost + +3 fruit (gated on rite using mandragora). Cost charge logic stays per-rite-paid as today. |
| Char has Mandragora 3, casts 2 Cruac rites both with garden ticked | Same as above (cost is per month, not per rite). | -3V cost (still once per month), +3 fruit. |
| Char has Mandragora 3, casts 1 Cruac rite without garden checkbox | Cost/fruit gate purely on the maintain toggle. | No cost (rite not in garden), no fruit (gate fails). |
| Char has Mandragora 0 (doesn't own the merit) | No row rendered, no toggle visible. | No row rendered. |
| Legacy DT 1 submission already published with the unconditional logic | Untouched (immutable past outcome). | Same — untouched. |
| Char doesn't own Cruac (Theban-only) but somehow has Mandragora Garden — edge case data | Toggle still works for fruit production (RAW doesn't require Cruac, only that the merit exists). | No rite ever ticks `mandragora=yes` (the checkbox is gated on Cruac rites — `:3766: if (hasMandragora && cruacRites.length)`). So no fruit ever fires under B for a Theban-only char. Confirm if this is intended. |

## Code Map

### Shared changes (both readings)

`public/js/tabs/downtime-form.js:5687-5690` — replace the unconditional fruit calc:
```js
// Mandragora Garden — effective dots across all bonus channels
const mandDots = effectiveDomainDots(c, 'Mandragora Garden');
const bloodFruit = mandDots;
```

with a gated version (function body depends on chosen reading):
```js
const mandDots = effectiveDomainDots(c, 'Mandragora Garden');
const mandActive = _isMandragoraActiveThisCycle(c, allResp);  // helper depending on reading
const bloodFruit = mandActive ? mandDots : 0;
const mandCost   = mandActive ? mandDots : 0;
```

And update `:5776` to gate the cost row similarly:
```js
if (mandCost > 0) negMods.push({ label: `Mandragora Garden (${'●'.repeat(mandDots)})`, val: -mandCost });
```

The fruit row at `:5799` already conditions on `bloodFruit > 0` — it'll hide automatically when gated off.

### Reading A — single maintain toggle

**New persisted field:** `mandragora_maintain` (boolean: `'yes'` / `'no'`, default `'no'`).

**New helper:**
```js
function _isMandragoraActiveThisCycle(c, allResp) {
  const hasMerit = (c.merits || []).some(m => m.name === 'Mandragora Garden');
  if (!hasMerit) return false;
  return allResp['mandragora_maintain'] === 'yes';
}
```

**Toggle placement (default option 1):** in the vitae projection panel, render a checkbox above the Mandragora cost row OR in the sorcery section near the per-rite mandragora controls:

```js
// In renderSorcerySection (around line 3717-3729 area), after the section intro:
if (hasMandragora) {
  const maintain = saved['mandragora_maintain'] === 'yes';
  h += '<div class="qf-field dt-mand-maintain-block">';
  h += `<label class="dt-mand-label" title="Tick to maintain the garden this cycle. Costs ${mandDots}V; produces ${mandDots} Blood Fruit.">`;
  h += `<input type="checkbox" id="dt-mandragora_maintain" class="dt-mand-cb"${maintain ? ' checked' : ''}>`;
  h += ` Maintain Mandragora Garden this cycle (cost: ${mandDots}V; produces ${mandDots} Blood Fruit)`;
  h += '</label></div>';
}
```

**Collector update at `:577-582`:** add the maintain field collection alongside the existing mandragora handling:
```js
const mandMaintainEl = document.getElementById('dt-mandragora_maintain');
responses['mandragora_maintain'] = mandMaintainEl ? (mandMaintainEl.checked ? 'yes' : 'no') : 'no';
```

**Re-render on toggle:** chip/checkbox click handler should re-render the form so the vitae projection panel updates immediately. Mirror the existing pattern at `:2462-2469` (mandragora checkbox → re-render).

### Reading B — gate fruit on existing per-rite flags

**No new persisted fields.** Reuse `sorcery_${n}_mandragora` and `sorcery_${n}_mand_paid`.

**New helper:**
```js
function _isMandragoraActiveThisCycle(c, allResp) {
  const hasMerit = (c.merits || []).some(m => m.name === 'Mandragora Garden');
  if (!hasMerit) return false;
  // Active if any sorcery slot has the mandragora flag set to 'yes'
  const slotCount = parseInt(allResp['sorcery_slot_count'] || '1', 10);
  for (let n = 1; n <= slotCount; n++) {
    if (allResp[`sorcery_${n}_mandragora`] === 'yes') return true;
  }
  return false;
}
```

**Cost-paid gate (per Boundaries clarification):** the cost still charges -mandDots once per month if active. The existing per-rite "Vitae cost already paid" flag (`sorcery_${n}_mand_paid`) means the player has already set aside that vitae out-of-band; the projection should suppress the cost line if any rite has that flag. Decision in Ask First — default behaviour: cost is charged regardless of `mand_paid`, since the "already paid" checkbox is informational for the ST review (it doesn't actually transfer vitae). Confirm.

```js
// Cost gate: simple — charge once per month if active.
const mandCost = mandActive ? mandDots : 0;
// (If "Ask First" decides cost is suppressed when any mand_paid is set, branch here.)
```

**No new UI** — Reading B uses existing checkboxes. The vitae projection panel updates on every form re-render (already does this when the per-rite mandragora checkbox toggles, per `:2462-2469`).

### Vitae projection panel — Reading A only: optional summary line

If Reading A is chosen, surface the maintain state in the projection panel header so the player knows the gate fired:
```js
if (mandActive) {
  h += `<div class="dt-vitae-row dt-vitae-note"><span style="font-style:italic">Garden maintained this cycle.</span><span></span></div>`;
}
```

Skip if Reading B — the per-rite Mandragora chips on the rite slot are visible context enough.

## Tasks & Acceptance

> **Both reading paths share the "shared changes" tasks. The reading-specific tasks ship only the chosen path. Do not implement both.**

**Shared (both readings):**

- [ ] Refactor the Mandragora gate at `:5687-5690` to use a `_isMandragoraActiveThisCycle(c, allResp)` helper.
- [ ] Refactor the cost row at `:5776` to use the helper-derived `mandCost`.
- [ ] Confirm the fruit row at `:5799` correctly hides when `bloodFruit === 0`.
- [ ] Manual smoke per Verification.

**Reading A (if chosen):**

- [ ] Add `mandragora_maintain` collection in `collectResponses` (`:577` area).
- [ ] Add the maintain toggle UI per the placement decision (default: vitae projection panel header OR sorcery section).
- [ ] Add a click handler that re-renders the form when the toggle changes.
- [ ] Implement `_isMandragoraActiveThisCycle` reading `mandragora_maintain`.
- [ ] (Optional) Add the "Garden maintained this cycle" note line in the projection panel.

**Reading B (if chosen):**

- [ ] Implement `_isMandragoraActiveThisCycle` reading `sorcery_${n}_mandragora` across all slot indices.
- [ ] Confirm existing re-render on per-rite mandragora checkbox click (`:2462-2469`) still fires; no new handler needed.
- [ ] Edge case for Theban-only Mandragora-owning char: confirm fruit suppression is intended (per Ask First).

**Acceptance Criteria (template — fill in after ruling):**

- Given a character with Mandragora Garden, when they DO NOT activate the gate (Reading A: don't tick maintain; Reading B: no rite uses mandragora), then the vitae projection shows neither the Mandragora cost row nor the Blood Fruit row.
- Given the same character, when they DO activate the gate, then the projection shows `-mandDots` cost AND `+mandDots` Blood Fruit. Both rows present.
- Given the gate is partially activated (Reading B: some rites tick mandragora, others don't), when projection renders, then cost is charged once per month and fruit is +mandDots once (not multiplied by rite count).
- Given a legacy submission already published, when re-rendered (e.g. ST opens it for review), then the published outcome is unchanged (immutable).
- Given a character without Mandragora Garden, when the form renders, then no Mandragora-related toggle, cost, or fruit row appears.
- (Reading A) Given the player ticks the maintain toggle, when the form re-renders, then the vitae projection panel updates immediately to show the cost and fruit rows.
- (Reading A) Given the player un-ticks the maintain toggle, when the form re-renders, then both rows vanish.
- (Reading B) Given the player ticks `sorcery_1_mandragora`, when the form re-renders, then the projection panel shows the cost and fruit rows.
- (Reading B) Given the player un-ticks the only sorcery slot's mandragora checkbox, when the form re-renders, then both rows vanish.

## Verification

**Commands:**

- No new tests required (single-path behavioural change).
- Browser console clean during toggle / checkbox interactions.

**Manual checks (template — adapt to chosen reading):**

1. Pick a character with Mandragora Garden 3 and at least one Cruac rite.
2. Open the DT form. Confirm the vitae projection panel shows starting state.
3. **Reading A:** confirm the maintain toggle is visible at the chosen placement. Untick — confirm projection has neither cost nor fruit row. Tick — confirm both appear (-3V, +3 fruit).
4. **Reading B:** open the sorcery section. Pick a rite. Tick its mandragora checkbox. Scroll to projection — confirm -3V and +3 fruit rows appear. Untick the checkbox — confirm both vanish.
5. Save and re-open the form. Confirm the gate state persists.
6. Switch to a character WITHOUT Mandragora Garden. Confirm no toggle, no cost row, no fruit row.
7. Open a previously-published DT 1 / DT 2 submission. Confirm the published outcome text is unchanged (immutability check).

## Final consequence

Mandragora Garden's gating becomes coherent: the cost and the fruit fire together, controlled by a single condition (whichever reading is chosen). The player has a clear way to opt out of maintenance for a cycle (Reading A) or to derive the gate naturally from their sorcery declarations (Reading B).

The dtlt-13 diagnostic finding is closed once the chosen reading lands. No follow-up expected unless the gate condition itself proves contentious in play.

The story file remains in this state until the ST team rules on Reading A vs B. When the ruling comes, sprint-status flips dtlt-10 from `backlog` to `ready-for-dev` and the dev agent picks it up — implementing only the chosen path per Tasks & Acceptance.
