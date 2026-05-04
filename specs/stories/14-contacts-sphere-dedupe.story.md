---
id: issue-14
issue: 14
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/14
branch: piatra-issue-14-contacts-sphere-dedupe
status: ready-for-review
priority: high
depends_on: []
---

# Story #14: Contacts sphere dropdown — prevent duplicate selections across dots

As an ST or player editing a Contacts merit on the character sheet,
I should not be able to select the same sphere on two different Contacts dots,
So that a character with Contacts 3 cannot silently collapse to one effective sphere despite paying for three.

---

## Context

The Contacts merit allocates one sphere per dot. The character sheet editor renders one `<select>` per dot, populated from `INFLUENCE_SPHERES`. Today each dropdown is built independently with the full list — there is no awareness of what sibling dots already use, so the user can pick "Police" three times and the merit reads as effectively one sphere wide.

### Files in scope

- `public/js/editor/sheet.js:836` — the `spOpts = s => INFLUENCE_SPHERES.map(...)` builder. Bug surface.
- `public/js/editor/sheet.js:843-849` — per-dot render loop that calls `spOpts(sp)`.

### Files NOT in scope

- `public/js/editor/edit-domain.js:55-61` — `shEditContactSphere` write path is fine; this is a dropdown-rendering issue only.
- `public/js/editor/sheet.js:886` — `_inflArea`'s separate `spOpts` for non-Contacts merits (Allies). Allies legitimately allow duplicate sphere across separate entries; do not touch.

### Key constraints

- The dot's *own current selection* must remain in its own dropdown, otherwise the user cannot see what's selected.
- Empty / unselected dots can pick from any sphere not in use elsewhere.
- The constraint is **per Contacts entry only**. The codebase asserts a singleton Contacts entry (`inflM.find(m => m.name === 'Contacts')` at `sheet.js:833`), so per-entry uniqueness is per-character uniqueness in practice.
- Switching dot A from "Police" to "Media" must free "Police" for sibling dots and lock "Media". The existing `renderSheet` re-render after `shEditContactSphere` already handles this — no additional plumbing is needed if the option-builder is purely a function of the current `spheres` array.

---

## Acceptance Criteria

**Given** a character with Contacts 3 and dot 1 set to "Police"
**When** the editor renders dot 2's sphere dropdown
**Then** "Police" is **not** in dot 2's option list (but every other sphere is, including dot 2's own current selection if any).

**Given** a character with Contacts 3 and dot 1 set to "Police", dot 2 set to "Media"
**When** the editor renders dot 3's sphere dropdown
**Then** dot 3's options exclude both "Police" and "Media"; all 14 other spheres are available.

**Given** the user clears dot 2's sphere (sets it to the "— sphere —" empty option)
**When** the sheet re-renders
**Then** dot 2's freed sphere becomes available again in dot 1's and dot 3's dropdowns.

**Given** dot 2 currently has "Media" selected
**When** dot 2's dropdown renders
**Then** "Media" still appears (and is marked `selected`) even though it is "in use" by dot 2 itself.

**Given** the bug fix is live
**When** non-Contacts influence merits (Allies, Resources, Retainer, etc.) render their sphere selectors
**Then** their behaviour is unchanged — duplicate spheres across separate Allies entries remain legal.

**Given** a character document already exists in MongoDB with duplicate spheres on a single Contacts entry (legacy data)
**When** the sheet renders that character
**Then** the editor does not crash; the duplicates display as-is and the user can correct them by re-picking. (No data migration is in scope; flag in PR if a one-off cleanup is warranted.)

---

## Implementation Notes

The minimal, surgical fix:

1. At `public/js/editor/sheet.js:836`, change `spOpts` from a sphere-only function to one that also takes the **current dot index**, so it can compute "spheres in use by *other* dots".
2. Inside the per-dot loop at `:843-849`, pass the dot index `d` into `spOpts(sp, d)`.
3. The new builder filters `INFLUENCE_SPHERES` to: spheres NOT in `spheres` at any index ≠ `d`. The dot's own selection at index `d` is always included.

Sketch:

```js
const spOpts = (currentSel, dotIdx) => {
  const used = new Set(
    spheres.filter((s, i) => i !== dotIdx && s) // skip own dot, skip empties
  );
  return INFLUENCE_SPHERES
    .filter(sp => !used.has(sp) || sp === currentSel)
    .map(sp => '<option' + (currentSel === sp ? ' selected' : '') + '>' + sp + '</option>')
    .join('');
};
```

Then in the loop: `spOpts(sp, d)` instead of `spOpts(sp)`.

Re-render is already handled — `shEditContactSphere` triggers a sheet re-render which rebuilds all dropdowns from fresh state.

---

## Test Plan

Manual verification in-browser (project has no test framework):

1. Pick a test character with Contacts 3+ in the admin editor (or create one).
2. **Test 1 — basic exclusion:** Set dot 1 = Police. Open dot 2's dropdown. Confirm Police is absent. Confirm other 15 spheres present.
3. **Test 2 — own selection visible:** Set dot 2 = Media. Open dot 2's dropdown. Confirm Media is selected and visible.
4. **Test 3 — clearing frees:** Set dot 2 to empty. Open dot 1's dropdown — confirm Media is back.
5. **Test 4 — switching:** With dot 1 = Police, dot 2 = Media, change dot 2 to Finance. Open dot 1's dropdown — confirm Media is back, Finance is gone.
6. **Test 5 — Allies regression:** Verify Allies still allows the same sphere across two separate Allies entries (no false propagation of the Contacts rule).
7. **Test 6 — legacy duplicates:** Open a character whose stored `spheres` array already contains duplicates (if any exist in live data; otherwise simulate by editing the document in dev). Confirm sheet renders without error.

---

## Definition of Done

- [ ] All ACs above pass manual verification *(QA — browser-only, not runnable from dev terminal)*
- [x] `git diff` is limited to `public/js/editor/sheet.js` (no spillover edits)
- [x] No new `console.error` or warnings on sheet render *(code review; no logging touched)*
- [x] Allies sphere dropdown behaviour unchanged (regression check) *(separate `spOpts` at sheet.js:886, not touched)*
- [ ] PR opened by `tm-gh-pr-for-branch`, body closes #14 *(SM step after QA)*

---

## Dev Agent Record

**Agent Model Used:** claude-opus-4-7 (James / DEV)

**Files Changed:**
- `public/js/editor/sheet.js` — `spOpts` builder takes `(currentSel, dotIdx)`, filters `INFLUENCE_SPHERES` to exclude spheres in use by sibling dots; the dot's own current selection is always included. Per-dot loop passes `d`.

**Completion Notes:**
- Surgical fix matches the story sketch exactly: `used = new Set(spheres.filter((s, i) => i !== dotIdx && s))`, then `INFLUENCE_SPHERES.filter(sp => !used.has(sp) || sp === currentSel)`.
- Re-render path unchanged: `shEditContactSphere` already triggers a sheet re-render which rebuilds dropdowns from fresh `spheres` state, so freeing/locking is automatic.
- Legacy duplicates (AC #6) handled benignly: for stored `[Police, Police]`, each dot's `used` excludes its own index, so each dropdown still shows "Police" via the `sp === currentSel` clause and renders without error. User can correct by re-picking.
- Empty/unselected dot: `currentSel === ''` never matches a sphere name, so empty dropdowns simply omit `used`. The `<option value="">— sphere —</option>` placeholder is appended outside `spOpts` and is unaffected.
- Allies/Resources/Retainer/etc. sphere selectors live in a separate `spOpts` at `sheet.js:886` (per `_inflArea`). Not touched.

**Change Log:**
- 2026-05-04 — Implemented per Story #14. Single commit on `piatra-issue-14-contacts-sphere-dedupe`.
