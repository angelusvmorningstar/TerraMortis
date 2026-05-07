# Story issue-150: Collapse 3-column desktop character sheet to 2-column layout

Status: review

issue: 150
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/150
branch: morningstar-issue-150-sheet-2col-layout

---

## Story

As a Storyteller or player viewing a character sheet on desktop,
I want merits and disciplines displayed in a single right column (merits above disciplines)
rather than three separate columns,
so that the sheet feels less cramped and uses horizontal space more sensibly.

---

## Background and Current State

**Files to change (both are small, surgical edits — read carefully before touching):**

1. `public/css/components.css:798` — CSS grid declaration for `.sh-desktop`
2. `public/js/editor/sheet.js:1856–1861` — isDesktop branch that builds the 3-column DOM

**Current 3-column DOM structure (sheet.js:1752 and 1856–1861):**

```
<div class="sh-desktop [sh-editing]">
  <div class="sh-dcol sh-dcol-left">
    ... identity, stats, attrs, skills, banes, touchstones, XP ...
  </div>
  <div class="sh-dcol sh-dcol-mid">
    <div class="sh-body">
      ... general/influence/domain/standing merits, manoeuvres, equipment ...
    </div>
  </div>
  <div class="sh-dcol sh-dcol-right">
    <div class="sh-body">
      ... disciplines ...
    </div>
  </div>
</div>
```

**Current CSS (components.css:798):**
```css
.sh-desktop{display:grid;grid-template-columns:4fr 3fr 3fr;gap:0 24px;align-items:start;}
.sh-dcol{min-width:0;overflow:visible;}
```

**Mobile collapse (components.css:805–810) — DO NOT TOUCH:**
```css
@media (max-width: 900px) {
  .sh-desktop { grid-template-columns: 1fr; gap: 16px; }
  ...
}
```
The `1fr` collapse already works correctly for 2-column; no media query changes needed.

**CSS specifics — no `sh-dcol-mid` or `sh-dcol-right` specific rules exist:**
A grep across all of `public/` confirms `sh-dcol-mid` and `sh-dcol-right` are only present in `sheet.js` — there are no CSS rules targeting them individually. Only `.sh-dcol` (the shared class) is styled. Safe to restructure freely.

**Three views that render this layout — all use the same `renderSheet()` path in `sheet.js`:**
- ST edit view: `admin.html` character panel with `editMode = true`
- ST view: `admin.html` character panel with `editMode = false`
- Player view: `index.html` (player portal), `.char-detail` wrapper

Note: `admin.html` has a `.char-detail .sh-desktop .sh-namerow{display:none;}` rule — that is correct and must not be disturbed.

**Non-desktop (mobile) path — line 1863 — already merges everything into one `sh-body`; no change needed there.**

---

## Acceptance Criteria

- [ ] All three views (ST edit, ST view, player view) render a 2-column desktop layout
- [ ] Left column content is identical to current (no reordering of anything inside `sh-dcol-left`)
- [ ] Right column shows merits sections above disciplines, flowing vertically in a single column div
- [ ] Narrow-viewport (`max-width: 900px`) collapse behaviour is unchanged
- [ ] No visual regression in section headings, dots, chips, merit rows, or discipline rows

---

## Tasks / Subtasks

- [x] Task 1: Update CSS grid declaration to 2-column
  - [x] 1a: Change `components.css:798` from `grid-template-columns:4fr 3fr 3fr` to `grid-template-columns:4fr 6fr`
  - [x] 1b: Update the comment on line 797 from "3-column layout" to "2-column layout"

- [x] Task 2: Restructure the desktop DOM in sheet.js
  - [x] 2a: Merge `sh-dcol-mid` and `sh-dcol-right` into a single `sh-dcol sh-dcol-right` div
  - [x] 2b: Inside that div, use one `sh-body` containing merits first then disciplines
  - [x] 2c: Update the comment on line 1750 from "3-col grid" to "2-col grid"

- [ ] Task 3: Smoke-test all three views

---

## Dev Notes

### Exact changes required

**Task 1 — components.css:797–798:**

Before:
```css
/* ── Desktop character sheet: 3-column layout ── */
.sh-desktop{display:grid;grid-template-columns:4fr 3fr 3fr;gap:0 24px;align-items:start;}
```

After:
```css
/* ── Desktop character sheet: 2-column layout ── */
.sh-desktop{display:grid;grid-template-columns:4fr 6fr;gap:0 24px;align-items:start;}
```

Rationale: `4fr 6fr` preserves the 40/60 split that was implicit in the original (left = 4/10, combined merits+disciplines = 6/10). The `gap` and `align-items` stay the same.

---

**Task 2 — sheet.js:1856–1861:**

Before (lines 1856–1861):
```js
  if (isDesktop) {
    h += '<div class="sh-body">' + shRenderAttributes(c, editMode) + shRenderSkills(c, editMode) + '</div>';
    h += '</div>'; // end sh-dcol-left
    h += '<div class="sh-dcol sh-dcol-mid"><div class="sh-body">' + shRenderGeneralMerits(c, editMode) + shRenderInfluenceMerits(c, editMode) + shRenderDomainMerits(c, editMode) + shRenderStandingMerits(c, editMode) + shRenderManoeuvres(c, editMode) + shRenderEquipment(c, editMode) + '</div></div>';
    h += '<div class="sh-dcol sh-dcol-right"><div class="sh-body">' + shRenderDisciplines(c, editMode) + '</div></div>';
    h += '</div>'; // end sh-desktop
  }
```

After:
```js
  if (isDesktop) {
    h += '<div class="sh-body">' + shRenderAttributes(c, editMode) + shRenderSkills(c, editMode) + '</div>';
    h += '</div>'; // end sh-dcol-left
    h += '<div class="sh-dcol sh-dcol-right"><div class="sh-body">' + shRenderGeneralMerits(c, editMode) + shRenderInfluenceMerits(c, editMode) + shRenderDomainMerits(c, editMode) + shRenderStandingMerits(c, editMode) + shRenderManoeuvres(c, editMode) + shRenderEquipment(c, editMode) + shRenderDisciplines(c, editMode) + '</div></div>';
    h += '</div>'; // end sh-desktop
  }
```

Key changes:
- `sh-dcol-mid` div is removed entirely
- `sh-dcol-right` now contains both merits (first) and disciplines (after)
- All render calls go into a single `sh-body` — mirrors what the non-desktop path on line 1863 already does
- `sh-dcol-left` open tag (line 1752) and everything inside it: untouched

Also update line 1750 comment from `// Desktop layout hint — admin CSS uses this for 3-col grid` to `// Desktop layout hint — admin CSS uses this for 2-col grid`.

---

### What must not break

- Mobile collapse: `@media (max-width: 900px)` rule collapses to `1fr` already — works for any number of columns. No change.
- `.char-detail .sh-desktop .sh-namerow{display:none;}` — scoped to `.char-detail`, unrelated to column structure.
- Non-desktop render path (line 1863) — single-column; unchanged.
- All section renderers (`shRenderDisciplines`, `shRenderGeneralMerits`, etc.) — their internal HTML is not touched.
- The `sh-desktop .sh-*` CSS rules that target padding/font within the desktop layout — all use `.sh-desktop` as parent; unaffected by merging columns.

---

## Dev Agent Record

### File List

- `public/css/components.css` — updated `.sh-desktop` grid declaration (3→2 col) and comment
- `public/js/editor/sheet.js` — merged `sh-dcol-mid` + `sh-dcol-right` into single `sh-dcol-right`; updated comment

### Completion Notes

Two-file surgical change. CSS: `grid-template-columns:4fr 3fr 3fr` → `4fr 6fr` (40/60 split, unchanged ratio). JS: removed `sh-dcol-mid` div entirely; merged its render calls (generalMerits + influenceMerits + domainMerits + standingMerits + manoeuvres + equipment) into `sh-dcol-right` before disciplines, all within one `sh-body`. No CSS rules targeted `sh-dcol-mid` individually — safe to remove. Mobile collapse (`1fr`) unaffected. Parse-check passed.

### Change Log

- 2026-05-07: Collapsed 3-column desktop sheet layout to 2-column; merits above disciplines in unified right column (components.css:797-798, sheet.js:1750+1859)
