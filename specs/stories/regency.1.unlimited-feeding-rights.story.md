---
title: 'Regent can add unlimited feeding right slots'
type: 'feature'
created: '2026-04-28'
status: 'ready-for-dev'
context: []
---

<frozen-after-approval reason="human-owned intent — do not modify unless human renegotiates">

## Intent

**Problem:** The Regency tab on the player portal renders feeding right slots from `max(cap, savedRights.length)`. There is no UI to append a new slot, so a Regent who wants to grant rights beyond the territory's ambience cap cannot do so. The cap is a soft signal (point at which problems happen), not a hard ceiling.

**Approach:** Add a `+ Add Feeding Right` button beneath the slots that appends a new empty dropdown to the rendered list. Existing over-capacity styling and the `Over capacity` warning chip continue to apply to any slot index `> cap`. Save logic is unchanged — the persisted array can already vary in length.

## Boundaries & Constraints

**Always:**
- Over-capacity warning chip remains for any slot index greater than `cap`.
- Regent (slot 1) and Lieutenant (slot 2 if present) stay locked and implicit; the new button only appends additional-rights slots.
- A slot occupied by a character who has already fed this cycle (`_lockedCharIds`) remains disabled and labelled "Fed this cycle".
- Confirmed-cycle slots remain disabled and labelled "Confirmed".
- A new empty slot must be reachable via the same character-dropdown population logic (`updateResidencyOptions`) so already-selected characters remain excluded.

**Ask First:**
- Whether to add a "Remove" button for empty additional-rights slots (currently slots can only be cleared by selecting `— None —`).

**Never:**
- Do not change the underlying `feeding_rights` schema.
- Do not change the cap calculation or the ambience source.
- Do not auto-add slots; appending is a deliberate Regent action.
- Do not remove the `Over capacity` warning.

## I/O & Edge-Case Matrix

| Scenario | Input / State | Expected Output / Behavior | Error Handling |
|----------|--------------|---------------------------|----------------|
| Within cap, click Add | cap=6, 4 saved | One new empty dropdown appears as slot 7; existing slots untouched | N/A |
| Already at cap, click Add | cap=6, 4 saved (slots 3-6 filled) | New slot 7 appears with `Over capacity` chip | N/A |
| Click Add multiple times | cap=6 | Each click appends one slot; chips applied to all slots > cap | N/A |
| Cycle confirmed | feeding_rights_confirmed=true, myConfirmation present | Add button hidden; existing slots stay disabled with "Confirmed" chip | N/A |
| Cycle gate pending, character fed | _lockedCharIds contains saved id | Existing locked slots stay disabled; new appended slot is editable | N/A |

</frozen-after-approval>

## Code Map

- `public/js/tabs/regency-tab.js` -- Renders feeding rights grid (line ~120-225); save logic at `saveRegency`. Add button + handler here.
- `public/css/regency.css` (or wherever `.dt-residency-grid` is styled) -- Add button styling if needed.

## Tasks & Acceptance

**Execution:**
- [ ] `public/js/tabs/regency-tab.js` -- After the slots loop (~line 208), render `+ Add Feeding Right` button when neither `cycleConfirmed && myConfirmation` is true. Append an empty slot to the local model and re-render on click.
- [ ] `public/js/tabs/regency-tab.js` -- Wire button event in `wireEvents()`. Re-run `updateResidencyOptions()` after append to refresh dropdown exclusions.
- [ ] Manual smoke test in browser: cap=6 territory, click Add until at least one over-capacity slot, save, reload, confirm slot persisted with `Over capacity` chip.

**Acceptance Criteria:**
- Given a Regent on a territory with cap=6 and 4 saved rights, when they click `+ Add Feeding Right`, then a new empty dropdown appears as slot 7.
- Given the new slot 7 is past the cap, when it renders, then the `Over capacity` warning chip is shown alongside it.
- Given the cycle has been confirmed by this Regent, when the panel renders, then the `+ Add Feeding Right` button is hidden.
- Given the Regent appends a slot and selects a character who is already chosen elsewhere, when the dropdown opens, then that character is excluded from the options.

## Verification

**Manual checks:**
- Local: open `http://localhost:8080/index.html`, log in via dev bypass as a Regent, navigate to Regency tab, verify the button appears, appended slots persist after save+reload, and over-capacity chip appears for slot > cap.
