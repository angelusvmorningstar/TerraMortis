---
id: dtui.17
epic: dtui
status: review
priority: high
depends_on: [dtui.15, dtui.10]
---

# Story DTUI-17: Allies Ambience eligibility gate

As a player whose Allies merit doesn't meet the Ambience contribution threshold,
I want Ambience to NOT appear as a selectable action in that merit's dropdown,
So that I can't pick an action my merit can't actually perform.

---

## Context

The Allies action dropdown (per dtui-15) includes `ambience_increase` and `ambience_decrease`. However, an Allies merit can only affect ambience if it has sufficient **effective dots** — the same threshold logic used in the domain influence calculation.

**Eligibility thresholds** (from `public/js/editor/domain.js` lines ~126–130):
- **Without Honey with Vinegar:** effective dots ≥ 3 → eligible (contribution = +1); ≥ 5 → +2 contribution
- **With Honey with Vinegar:** effective dots ≥ 2 → eligible (contribution = +1); ≥ 4 → +2 contribution
- **If effective dots are below threshold:** contribution = 0 → Ambience options are hidden entirely (filter-to-context, not greyed)

**Effective dots** for a sphere merit: `(m.dots || m.rating || 0) + (m.bonus || 0)`

**Honey with Vinegar check:** `hasHoneyWithVinegar(c)` is exported from `public/js/editor/domain.js` (line ~157). It returns `true` if the character has a merit named `'Honey With Vinegar'` or `'Honey with Vinegar'`. This function **must be imported** into `downtime-form.js` (or the logic duplicated inline using a direct merit scan of `currentChar.merits`).

**Implementation approach:** In the sphere tab-pane render loop (line ~4748–4755), the `<select>` is populated by `SPHERE_ACTIONS.filter(o => o.value !== 'grow')`. This story changes the filter to also exclude `ambience_increase` and `ambience_decrease` when the specific merit instance does not meet the threshold.

The filter is **per-merit-instance** — each tab pane may have a different Allies merit with different effective dots. The filter must be applied per-`n` (per-tab), not globally.

---

## Files in scope

- `public/js/tabs/downtime-form.js` — add `getAlliesAmbienceEligible(m)` helper; update sphere dropdown filter in `renderMeritToggles()` to exclude ambience options when the merit is ineligible

---

## Out of scope

- Allies Ambience contribution display (dtui-18)
- Status merit ambience eligibility — Status merits have their own contribution logic; this story is Allies only
- Any ambience logic changes in domain.js

---

## Acceptance Criteria

### AC1 — Allies merit with effective dots ≥ 3 (no HwV): Ambience options appear

**Given** an Allies merit instance with effective dots ≥ 3 and the character does NOT have Honey with Vinegar,
**When** the action-type dropdown renders for that merit,
**Then** `ambience_increase` and `ambience_decrease` appear as selectable options.

### AC2 — Allies merit with effective dots < 3 (no HwV): Ambience options hidden

**Given** an Allies merit instance with effective dots < 3 and no Honey with Vinegar,
**When** the action-type dropdown renders for that merit,
**Then** `ambience_increase` and `ambience_decrease` are excluded entirely from the dropdown (NOT greyed — filter-to-context means hidden).

### AC3 — With HwV, threshold is ≥ 2: Ambience options appear

**Given** the character has Honey with Vinegar AND an Allies merit with effective dots ≥ 2,
**When** the action-type dropdown renders for that merit,
**Then** Ambience options appear as selectable.

### AC4 — With HwV, effective dots < 2: Ambience options hidden

**Given** the character has Honey with Vinegar AND an Allies merit with effective dots < 2,
**When** the action-type dropdown renders for that merit,
**Then** Ambience options are excluded entirely.

### AC5 — Effective rating discipline applied

**Given** an Allies merit has inherent dots 2 and bonus dots 1 (effective dots 3),
**When** the eligibility check runs,
**Then** the check uses effective dots (3) → eligible (≥ 3 threshold without HwV) → Ambience appears.

### AC6 — Back-compat: saved ambience action on newly-ineligible merit

**Given** a character previously had effective dots ≥ 3 (ambience eligible) and saved `sphere_N_action = 'ambience_increase'`,
**When** bonus dots drop and effective dots are now < 3,
**Then** the dropdown renders without the ambience option; the saved value is orphaned (no matching option); the select falls to the empty option — no JS error.

---

## Implementation Notes

### Helper: `getAlliesAmbienceEligible(m)`

```javascript
function getAlliesAmbienceEligible(m) {
  const effectiveDots = (m.dots || m.rating || 0) + (m.bonus || 0);
  const hwv = (currentChar.merits || []).some(
    merit => merit.name === 'Honey With Vinegar' || merit.name === 'Honey with Vinegar'
  );
  if (hwv) return effectiveDots >= 2;
  return effectiveDots >= 3;
}
```

This avoids importing `hasHoneyWithVinegar` from domain.js (which may require a bundling change). Use this inline helper to keep the change entirely within downtime-form.js.

If `domain.js` is already imported in downtime-form.js, prefer `hasHoneyWithVinegar(currentChar)` directly.

### Filter in sphere dropdown render loop

In `renderMeritToggles()`, in the sphere tab-pane loop (line ~4748–4755), change the dropdown population:

**Before:**
```javascript
for (const opt of SPHERE_ACTIONS.filter(o => o.value !== 'grow')) {
  const sel = actionVal === opt.value ? ' selected' : '';
  h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
}
```

**After:**
```javascript
const ambienceEligible = getAlliesAmbienceEligible(m);
const filteredActions = SPHERE_ACTIONS.filter(o => {
  if (o.value === 'grow') return false;               // Grow handled by dtui-19
  if (!ambienceEligible && (o.value === 'ambience_increase' || o.value === 'ambience_decrease')) return false;
  return true;
});
for (const opt of filteredActions) {
  const sel = actionVal === opt.value ? ' selected' : '';
  h += `<option value="${esc(opt.value)}"${sel}>${esc(opt.label)}</option>`;
}
```

The variable `m` is already in scope within the pane loop (from `detectedMerits.spheres[n - 1]`).

### AC6 back-compat

No special handling required. A `<select>` with no matching `selected` option falls to the first option (`''`). The player will see "No Action Taken" and must re-select — correct behaviour for an action they're now ineligible to take.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — add `getAlliesAmbienceEligible(m)`; update sphere dropdown filter in `renderMeritToggles()`

---

## Definition of Done

- AC1–AC6 verified
- Allies merits with effective dots ≥ 3 (no HwV): Ambience options visible
- Allies merits with effective dots < 3 (no HwV): Ambience options hidden
- HwV threshold (≥ 2) tested with a character who has HwV
- Effective dots = inherent + bonus (CC1 confirmed)
- Orphaned saved ambience value degrades to empty without error
- `specs/stories/sprint-status.yaml` updated: dtui-17 → review

---

## Compliance

- CC1 — Effective rating discipline: `(m.dots || m.rating || 0) + (m.bonus || 0)` — never inherent only
- CC2 — Filter-to-context: ineligible option is hidden (absent), not greyed — the player should not know it exists if they can't use it
- CC9 — No new UI components; dropdown filter is pure data logic

---

## Dependencies and Ordering

- **Depends on:** dtui-15 (SPHERE_ACTIONS updated, ambience options in the array), dtui-10 (context on ambience action naming; sphere uses ambience_increase/decrease not ambience_change)
- **Unblocks:** dtui-18 (contribution display, which builds on the eligibility gate)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`getAlliesAmbienceEligible(m)` added inline (HwV check via `currentChar.merits` scan rather than domain.js import, since `hasHoneyWithVinegar` is not currently imported). Sphere dropdown filter updated to use `filteredActions` — excludes ambience options per-merit-instance and keeps Grow excluded (dtui-19 will remove that exclusion).

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-17 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-17 implemented; status → review. |
