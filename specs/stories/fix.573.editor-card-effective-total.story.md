# Story Fix.573: Editor card total shows effective rating inclusive of bonus dots

## Status: review

## Metadata
- issue: 573
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/573
- branch: morningstar-issue-573-effective-rating-card-total
- type: bug

---

## Story

**As an** ST editing a character in the admin sheet editor,
**I want** the prominent corner total on each Attribute and Skill card to show the effective rating inclusive of bonus dots,
**so that** the number matches the dots I see (filled + hollow) and the effective rating read everywhere else, instead of under-reporting by the bonus amount.

---

## Background

### The bug (observed)

In the sheet editor edit mode, the Expression skill card shows CP 4, XP 0, a Professional Training bonus dot (rendered as the hollow dot in `●●●●○`, with a `9-AGAIN (PT)` badge), and a prominent corner total of **4**. The effective rating is **5**. The corner total sums only CP + XP-derived dots and ignores the bonus dot.

Per the project rule that bonus dots are mechanically identical to inherent dots and must always be read at effective rating (see `feedback_effective_rating_discipline` memory; AC-aligned with the read-only sheet which already renders bonus via `shDotsWithBonus`), the corner total is wrong. The same defect exists on Attribute cards.

### What already exists

All bonus-dot machinery is in place — this is purely a display arithmetic fix in the corner total. No data model, accessor, save path, or XP-cost change is needed.

**Skill card** — `public/js/editor/sheet.js`, `shRenderSkills`, edit-mode branch (~line 533-537):
```js
// ~533: dot display ALREADY includes bonus (filled d + hollow bonus)
const ... d = sk.dots, bn = sk.bonus,
  ptBn = c._pt_dot4_bonus_skills?.has(s) ? 1 : 0,
  mciBn = c._mci_dot3_skills?.has(s) ? 1 : 0,
  ... dotStr = hasDots ? shDotsWithBonus(d, bn + ptBn + mciBn) : '–';
// ~535: corner total — EXCLUDES bonus
const so2 = (c.skills||{})[s]||{}, ..., sb = so2.cp||0, sxd = xpToDots(so2.xp||0, sb, 2), st2 = sb + sxd;
// ~536: rendered as the bd-val corner number
... '<div class="bd-eq"><span class="bd-val">' + st2 + '</span></div>' ...
```
`st2` (= `cp + floor(xp/2)`) equals `d` (the filled-dot count) for consistent data. The rendered dots are `d` filled + `(bn + ptBn + mciBn)` hollow. The corner shows only the filled count.

**Attribute card** — `public/js/editor/sheet.js`, `shRenderAttributes`, edit-mode branch (~line 444-449):
```js
// ~444
const ao = c.attributes[a]||{}, baseDots = 1 + (isClan?1:0), ab = baseDots + (ao.cp||0),
  xd = xpToDots(ao.xp||0, ab, 4), tot = ab + xd;
// ~445: dot display ALREADY includes bonus (filled base + hollow autoBonus+bonus)
... shDotsWithBonus(base, autoBonus + bonus) ...
// ~446: corner bd-val — EXCLUDES bonus
... '<div class="bd-eq"><span class="bd-val">' + tot + '</span></div>' ...
// ~447: effTotal is ALREADY computed here, shown only in a conditional secondary "Eff" sub-row
const effTotal = tot + autoBonus + bonus;
... (autoBonus > 0 || bonus > 0 ? '<div class="bd-eff"><span class="bd-lbl">Eff</span> <span class="bd-val">' + effTotal + '</span></div>' : '') ...
```
`tot` equals `base` (filled count) for consistent data; `autoBonus` is the discipline enhancement (`c.disciplines?.[BONUS_SOURCE[a]]?.dots`), `bonus` is `getAttrBonus`. `effTotal` is the value we want in the corner; it is already computed.

### Design rule (display-only)

The corner total is a derived display value. This change must NOT touch the `CP` / `XP` / `Base` inputs (they keep showing the raw point allocations), `cp`/`xp`/`dots`/`bonus` stored fields, `syncMeritRating`, XP-cost calculations (`xpSpent`, `_skillAlert` budget check at ~line 490 reads `cp` directly), or any save path. The invariant to hold: **the corner total must equal the count of rendered dots (filled + hollow)** so the number and the dots can never disagree.

### Out of scope

- The read-only sheet view — already renders bonus dots correctly via `shDotsWithBonus`; its rows have no `bd-val` corner total.
- `attrs-tab.js` (the separate Attributes & Skills tab) — it has no corner total; not affected.
- Capping logic. The editor dot display does not cap hollow dots at 5; to preserve the corner == rendered-dots invariant, the corner total must NOT introduce a cap that the dots don't have. (The `skTotal` accessor caps at 5 — do NOT reuse it here, it would diverge from the rendered dots when total > 5.)

---

## Acceptance Criteria

- [x] Given a skill with CP 4, XP 0, and a PT bonus dot, When viewed in the editor card edit mode, Then the corner total (`bd-val`) shows **5** and the dots show `●●●●○`. _(static trace: `skEff = st2(4) + bn(0) + ptBn(1) + mciBn(0) = 5`; dots `shDotsWithBonus(4, 1)` = `●●●●○`)_
- [x] Given a skill with a manual bonus and/or MCI dot-3 bonus, When viewed in the editor card, Then the corner total includes those bonus dots (= `cp + floor(xp/2) + bn + ptBn + mciBn`, matching the filled+hollow dot count).
- [x] Given an attribute with a discipline auto-bonus and/or manual bonus, When viewed in the editor card, Then the corner total shows the effective rating (= `tot + autoBonus + bonus`), matching the filled+hollow dot count.
- [x] Given a skill or attribute with zero bonus dots, When viewed in the editor card, Then the corner total is unchanged (skill `skEff = st2 + 0`; attribute `tot + 0 + 0`).
- [x] The `CP` / `XP` / `Base` input fields continue to show the raw point allocations, not effective values. _(input fields untouched — only the `bd-val` expression changed)_
- [x] No change to saved character data, XP-cost calculations, or the skill-priority budget alert. _(render-only change; `_skillAlert`/`cp`/`xp`/save paths untouched)_

---

## Tasks

### Task 1 — Skill card corner total includes bonus dots (AC 1, 2, 4) ✓

**File:** `public/js/editor/sheet.js` — `shRenderSkills`, edit-mode branch (~line 535-536)

Change the corner `bd-val` from the bonus-excluding `st2` to the effective total that matches the rendered dots. The bonus channels `bn`, `ptBn`, `mciBn` are already in scope on the row (~line 533). Keep `st2` if it is referenced elsewhere; otherwise add the bonus addends to the value rendered in `<span class="bd-val">`:

```js
const skEff = st2 + bn + ptBn + mciBn;   // matches shDotsWithBonus(d, bn + ptBn + mciBn)
// ... render skEff in the bd-val span instead of st2
```

Do not change the `CP` / `XP` number inputs in the same panel.

### Task 2 — Attribute card corner total includes bonus dots (AC 3, 4) ✓

**File:** `public/js/editor/sheet.js` — `shRenderAttributes`, edit-mode branch (~line 446-449)

Render `effTotal` (already computed at ~line 447 as `tot + autoBonus + bonus`) in the corner `bd-val` (~line 446) instead of `tot`. Because the corner now carries the effective value, remove the now-redundant inline `bd-eff` "Eff" span at ~line 449 (the per-source `autoBonus` breakdown row at ~line 448 and the `Bonus` stepper stay).

Note `effTotal` is declared inside the block at ~447 but the `bd-val` is emitted at ~446; move the `effTotal` (and the `src`/`aE2` it shares the block with) declaration above the `bd-eq` emission, or compute the effective value inline at the corner, so it is in scope where rendered.

Do not change the `Base` read-only value or the `CP` / `XP` inputs.

### Task 3 — Manual smoke verification (no test framework) — PENDING DEV DEPLOY

> Static verification done (ESM parse-check passes; arithmetic traced against `shDotsWithBonus` in every AC). The **in-browser** checks below cannot be run locally (no local browser testing; smoke needs code on `dev` first) — they are handed to QA / the user to confirm post-deploy.

Verify in-browser (after the change is on `dev` — local smoke needs code on dev first):
- A skill with a PT bonus (e.g. Expression with PT asset-skill 9-Again) shows corner **5** with `●●●●○`.
- An attribute with a discipline enhancement (e.g. Vigour-boosted Strength) shows the effective corner total matching its hollow dots.
- A plain skill/attribute with no bonus shows the same corner total as before.
- Entering and re-saving a character writes back unchanged `cp`/`xp`/`dots`/`bonus` (corner change is render-only).

---

## Dev Notes

### Files to touch

- `public/js/editor/sheet.js` — the only file. Two render sites: `shRenderSkills` edit branch (~533-537) and `shRenderAttributes` edit branch (~444-450).

### Must preserve

- `cp` / `xp` / `Base` input fields render raw allocations (line 446 attr inputs, line 536 skill inputs).
- The skill-priority budget alert `_skillAlert` (~line 490) reads `c.skills?.[sk]?.cp` directly — unaffected, do not touch.
- The read-only branches (`shRenderSkills` else-branch ~545-573, `shRenderAttributes` else-branch ~453-483) already render bonus via `shDotsWithBonus` and have no corner total — leave them.
- Epic STM overlay: edit mode strips `_st_mod_overlay` (the overlay opts are empty in edit mode per STM-2 `stripOverlay`), so the edit-branch corner totals operate on canonical base values. No overlay interaction in this change.

### Reference helpers (read for context, do not modify)

- `xpToDots(xp, base, costPerDot)` → `Math.floor(xp / costPerDot)` — `public/js/editor/xp.js:15`
- `shDotsWithBonus(base, bonus, opts)` → `base` filled + `bonus` hollow dots — `public/js/data/helpers.js:124`
- `getAttrEffective(c, attr)` = base + bonus + discAttrBonus — `public/js/data/accessors.js:77` (equivalent to attr `effTotal`; reuse of the local `effTotal` is preferred to avoid `BONUS_SOURCE` vs `discAttrBonus` divergence risk)
- `skTotal(c, skill)` — `public/js/data/accessors.js:109` — **do not reuse**: caps at 5 and gates PT/MCI at `base < 5`, which would diverge from the uncapped rendered hollow dots.

### References

- [Source: public/js/editor/sheet.js#shRenderSkills edit branch ~533-537] — skill `st2` corner total + `bn`/`ptBn`/`mciBn`
- [Source: public/js/editor/sheet.js#shRenderAttributes edit branch ~444-449] — attr `tot` corner total + existing `effTotal`
- [Source: public/js/data/helpers.js:124] — `shDotsWithBonus` (the dot renderer the corner total must match)
- [Source: GitHub issue #573] — https://github.com/angelusvmorningstar/TerraMortis/issues/573
- Prior adjacent work: Feature.333 (merit/skill/attr manual bonus dot stepper) created the `bonus` channel this story now surfaces in the total.

### Project Structure Notes

- British English in any UI text (no new copy expected here — numeric change only).
- No new styles: `bd-val` / `bd-eff` classes already exist; this change reuses `bd-val` and removes one `bd-eff` usage on the attribute card.

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (BMAD dev-story)

### Debug Log References

- ESM parse-check: `node --input-type=module --check < public/js/editor/sheet.js` → PARSE OK.

### Implementation Plan

Pure display arithmetic change in `public/js/editor/sheet.js`, two render sites in the edit-mode branches. No accessor, data-model, save-path, or XP-cost change.

### Completion Notes List

- **Task 1 (skill card):** `sheet.js:535` — added `skEff = st2 + bn + ptBn + mciBn` to the existing const chain (`bn`/`ptBn`/`mciBn` already declared on line 533 for the dot display); `sheet.js:536` `bd-val` now renders `skEff` instead of `st2`. The corner total now equals the rendered filled+hollow dot count.
- **Task 2 (attribute card):** `sheet.js:446` — `bd-val` now renders `(tot + autoBonus + bonus)` (the effective rating) instead of `tot`; `base`/`autoBonus`/`bonus` were already in scope from lines 442-443. Removed the now-redundant inline `bd-eff` "Eff" span from the Bonus row (`sheet.js:449`) and dropped the now-unused `effTotal` const (`sheet.js:447`) to avoid a dead variable. The per-source autobonus breakdown row and the Bonus stepper are unchanged.
- **Did NOT** reuse `skTotal` (caps at 5, would diverge from uncapped rendered hollow dots) per Dev Notes guardrail. Used the story's stated formulas so the corner total mirrors `shDotsWithBonus` exactly.
- **Verification:** ESM parse-check passes. Each AC traced statically against the dot-render call. In-browser smoke (Task 3) is pending `dev` deploy — handed to QA (cannot run locally per project constraint).
- **No-regression rationale:** change is render-only inside `editMode` branches; CP/XP/Base inputs, `_skillAlert` budget check (reads `cp`), save paths, and stored `cp`/`xp`/`dots`/`bonus` are untouched. Read-only sheet branches were not modified.

### File List

- `public/js/editor/sheet.js` (modified) — `shRenderSkills` edit branch corner total (~535-536); `shRenderAttributes` edit branch corner total + removed redundant Eff span (~446-449)
- `tests/char-editor-effective-total.spec.js` (added, QA) — Playwright E2E covering skill manual-bonus, skill zero-bonus, attribute discipline+manual bonus, attribute zero-bonus
- `specs/stories/fix.573.editor-card-effective-total.story.md` (this story)

### Change Log

- 2026-06-04 — Editor card corner total (`bd-val`) now shows effective rating inclusive of bonus dots for both Attributes and Skills, matching the rendered filled+hollow dots. Removed redundant attribute "Eff" sub-value. Render-only; no data/XP changes. (Issue #573)
- 2026-06-04 — QA (Quinn): added `tests/char-editor-effective-total.spec.js` (4 Playwright E2E tests, all passing). Static review found no correctness issues. Pre-existing unrelated failure noted (see QA Review).

## QA Review (Quinn)

**Outcome: Approve.** Implementation matches the ACs; the corner total now mirrors `shDotsWithBonus` exactly on both card types.

**Correctness (static):**
- Skill `skEff = st2 + bn + ptBn + mciBn` uses the same bonus channels the dot display already uses (`sheet.js:533`) — corner and dots can no longer disagree on the bonus portion. `bn`/`ptBn`/`mciBn` confirmed in scope.
- Attribute corner `tot + autoBonus + bonus` equals the pre-existing `effTotal`; the now-redundant inline "Eff" span and its const were removed cleanly (no dangling refs; `src`/`aE2` still used). The per-source auto-bonus breakdown row and the Bonus stepper are retained, so the breakdown is still visible.
- Correctly avoided `skTotal` (caps at 5, would diverge from uncapped rendered dots).
- Zero-bonus paths provably unchanged (bonus addends = 0).

**Tests added — `tests/char-editor-effective-total.spec.js` (4 passing, 26s):**
1. Skill manual bonus → corner `5`, dots 5 total with 1 hollow (the issue's exact Expression case).
2. Skill zero bonus → corner unchanged (`2`), 0 hollow.
3. Attribute discipline auto-bonus (Vigour) + manual bonus → corner `5`, 2 hollow dots.
4. Attribute zero bonus → corner unchanged (`2`).

**Regression:** `tests/char-editor-save.spec.js` → 6/7 pass. The 1 failure ("character card shows clan and blood potency", grid-card render) is **pre-existing** — reproduced with this story's change stashed, on unmodified `sheet.js`. Unrelated to #573; flagged separately, not a blocker for this story.

**Note for the dev/owner:** the corner's *filled* portion derives from `cp`/`xp` (`st2`/`tot`) while the dots derive from stored `dots`/`base`. If a character's `cp`/`xp` ever drift out of sync with `dots`, the filled count and corner could disagree — but that is a pre-existing data-hygiene condition independent of this change (the old corner already showed `st2`/`tot`). Out of scope here; worth keeping in mind for the broader data-hygiene campaign.
