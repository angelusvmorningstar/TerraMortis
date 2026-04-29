---
id: dtui.18
epic: dtui
status: review
priority: medium
depends_on: [dtui.17]
---

# Story DTUI-18: Allies Ambience contribution display

As a player whose Allies merit qualifies for Ambience,
I want to see exactly how many points my exhaustion of these allies will contribute, dynamically based on my dots and the Improve/Degrade direction,
So that I understand the cost-benefit before committing.

---

## Context

When an Allies merit selects `ambience_increase` or `ambience_decrease`, dtui-17 ensures eligibility is met. This story adds a **read-only contribution display** showing the player the exact ±1 or ±2 impact their Allies will have, plus a notice that the allies will be exhausted for the next game.

**Contribution formula** (from `public/js/editor/domain.js` lines ~126–130):

| Condition | Effective dots | Contribution |
|-----------|---------------|--------------|
| No HwV    | ≥ 5           | +2 / –2      |
| No HwV    | 3–4           | +1 / –1      |
| HwV       | ≥ 4           | +2 / –2      |
| HwV       | 2–3           | +1 / –1      |

Sign is `+` for `ambience_increase`, `–` for `ambience_decrease`.

The display renders as a read-only `.dt-action-desc` block (italic Lora, `aria-live="polite"`), placed **below the territory picker** and **above the outcome field** in the sphere action block.

**Dynamic update:** When the player changes the direction (`ambience_increase` ↔ `ambience_decrease`), the contribution display updates via the standard re-render triggered by the action `<select>` change handler. No separate live-update logic is needed — the full sphere tab pane re-renders on action change.

**Exhaustion notice:** Alongside the contribution value, a short notice warns the player that selecting Ambience exhausts the allies until the next game. Copy from the UX spec:
- Improve: *"You are exhausting these allies for the next game. These allies will count +N towards the targeted territory's ambience."*
- Degrade: *"You are exhausting these allies for the next game. These allies will count –N towards the targeted territory's ambience."*

---

## Files in scope

- `public/js/tabs/downtime-form.js` — add `getAlliesAmbienceContribution(m)` helper; add `renderAlliesAmbienceDisplay(m, actionVal)` helper; call it in `renderSphereFields()` for ambience action types

---

## Out of scope

- Changes to the eligibility check (dtui-17)
- Any change to the ambience action values or field list (dtui-15)
- Server-side processing — this is a display-only read-only block

---

## Acceptance Criteria

### AC1 — Contribution display appears for ambience actions

**Given** an Allies merit with effective dots 3–4 (no HwV) selects `ambience_increase`,
**When** the sphere action block renders,
**Then** a read-only display appears below the territory picker reading: *"You are exhausting these allies for the next game. These allies will count +1 towards the targeted territory's ambience."*

### AC2 — Contribution is +2 at dots 5 (no HwV)

**Given** an Allies merit with effective dots 5 (no HwV) selects `ambience_increase`,
**When** the display renders,
**Then** the value reads "+2".

### AC3 — HwV at dots 2–3: contribution is +1

**Given** the character has Honey with Vinegar AND an Allies merit with effective dots 2–3 selects `ambience_increase`,
**When** the display renders,
**Then** the value reads "+1".

### AC4 — HwV at dots 4–5: contribution is +2

**Given** the character has Honey with Vinegar AND an Allies merit with effective dots 4–5 selects `ambience_increase`,
**When** the display renders,
**Then** the value reads "+2".

### AC5 — Sign flips for ambience_decrease

**Given** any eligible Allies merit selects `ambience_decrease` (Degrade direction),
**When** the display renders,
**Then** the sign is negative (e.g. "–1" not "+1"; note: use the proper minus sign U+2013 or plain dash; do NOT use em-dash U+2014).

### AC6 — Display is read-only and screen-reader announced

**Given** the display is visible,
**When** the screen reader encounters it,
**Then** the element has `aria-live="polite"` and is read-only (no interactive elements inside it).

---

## Implementation Notes

### `getAlliesAmbienceContribution(m)` helper

```javascript
function getAlliesAmbienceContribution(m) {
  const effectiveDots = (m.dots || m.rating || 0) + (m.bonus || 0);
  const hwv = (currentChar.merits || []).some(
    merit => merit.name === 'Honey With Vinegar' || merit.name === 'Honey with Vinegar'
  );
  if (hwv) {
    if (effectiveDots >= 4) return 2;
    if (effectiveDots >= 2) return 1;
    return 0;
  }
  if (effectiveDots >= 5) return 2;
  if (effectiveDots >= 3) return 1;
  return 0;
}
```

### `renderAlliesAmbienceDisplay(m, actionVal)` helper

```javascript
function renderAlliesAmbienceDisplay(m, actionVal) {
  const contribution = getAlliesAmbienceContribution(m);
  if (contribution === 0) return ''; // ineligible; dtui-17 already hides the option
  const sign = actionVal === 'ambience_increase' ? '+' : '–'; // + or –
  const copy = `You are exhausting these allies for the next game. These allies will count ${sign}${contribution} towards the targeted territory's ambience.`;
  return `<div class="dt-action-desc" aria-live="polite">${esc(copy)}</div>`;
}
```

### Calling site in `renderSphereFields()`

After the territory picker (the `fields.includes('territory')` block), add:

```javascript
// Allies Ambience contribution display (dtui-18)
if (actionVal === 'ambience_increase' || actionVal === 'ambience_decrease') {
  h += renderAlliesAmbienceDisplay(sphereMerit, actionVal);
}
```

The `sphereMerit` object must be passed into `renderSphereFields()`. Currently the function signature is `renderSphereFields(n, prefix, fields, saved, charMerits)`. Add a sixth parameter:

```javascript
function renderSphereFields(n, prefix, fields, saved, charMerits, sphereMerit = null)
```

Update the call site in `renderMeritToggles()` (line ~4757):

```javascript
h += renderSphereFields(n, 'sphere', fields, saved, charMerits, m);
```

Where `m` is `detectedMerits.spheres[n - 1]` already in scope in the pane loop.

The status merit call at line ~4809 passes `null` (default) — no ambience display for Status merits.

### Minus sign note

Use a plain hyphen-minus (`-`) or en-dash (`–`) for the negative sign in the copy — do **not** use em-dash (`—`). CC5 prohibits em-dashes in all copy.

---

## Files Expected to Change

- `public/js/tabs/downtime-form.js` — add `getAlliesAmbienceContribution(m)`; add `renderAlliesAmbienceDisplay(m, actionVal)`; update `renderSphereFields()` signature to accept `sphereMerit`; add contribution display call inside `renderSphereFields()`; update `renderMeritToggles()` sphere pane call to pass `m`

---

## Definition of Done

- AC1–AC6 verified
- +1/+2 display for eligible merits (both directions)
- HwV threshold tested
- Effective dots used (not inherent only)
- Sign correct per direction; no em-dash
- `aria-live="polite"` on display element
- No regression in Status merit rendering (null sphereMerit parameter)
- `specs/stories/sprint-status.yaml` updated: dtui-18 → review

---

## Compliance

- CC1 — Effective rating discipline: `(m.dots || m.rating || 0) + (m.bonus || 0)` used in contribution calc
- CC4 — Token discipline: `.dt-action-desc` class reused; no bare hex
- CC5 — British English, no em-dashes in copy
- CC6 — `aria-live="polite"` on contribution display

---

## Dependencies and Ordering

- **Depends on:** dtui-17 (eligibility gate; contribution display only renders for eligible merits)
- **Unblocks:** nothing within Wave 3 (dtui-19 is independent of this)

---

## Dev Agent Record

### Agent Model Used

claude-sonnet-4-6

### Completion Notes

`getAlliesAmbienceContribution(m)` and `renderAlliesAmbienceDisplay(m, actionVal)` added. Sign uses plain hyphen-minus '-' for decrease (not em-dash, per CC5). `renderSphereFields()` updated with `sphereMerit = null` 6th param; contribution display injected inside the `territory` block (after the territory picker) when action is ambience_increase/decrease. Sphere pane loop passes `m` as 6th arg; status pane continues with null (default) — no regression. HwV check inline (consistent with dtui-17 pattern, no new domain.js import).

### File List

- `public/js/tabs/downtime-form.js`

### Change Log

| Date | Change |
|------|--------|
| 2026-04-29 | DTUI-18 story drafted; ready-for-dev. |
| 2026-04-29 | DTUI-18 implemented; status → review. |
