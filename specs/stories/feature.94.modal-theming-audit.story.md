# Story CR-5: Modal Theming Audit

Status: complete

## Story

**As a** user of the player or admin app,
**I want** all modals to use the parchment theme consistently,
**so that** the app feels visually cohesive.

## Background

The reference modal pattern is `.plm-overlay` / `.plm-dialog` / `.plm-header` / `.cd-close`, defined in `public/css/player-layout.css` lines 251–365.

**Audit result — compliant (no action needed):**
- New Character modal (`admin.js:642`) — already uses `.plm-overlay` + `.plm-dialog` ✅
- Profile modals (player + admin) — already compliant ✅
- Player Link modal (`admin.js:795`) — already compliant ✅
- Ordeals modal — uses `.om-*` classes that _extend_ `.plm-overlay` / `.plm-dialog` as base ✅

**Audit result — intentionally out of scope:**
- Rules Editor modal (`.rules-modal-*`) — 700px complex form with prereq builder; bespoke layout is warranted
- Downtime Cycle Wizard (`.gc-wizard-*`) — multi-phase checklist wizard; bespoke layout is warranted

**Audit result — requires fix:**
- **Cast Picker modal** (`.dt-cast-overlay` / `.dt-cast-modal`) in `downtime-form.js` — parallel CSS that duplicates the `.plm-*` pattern under different class names. Fix: migrate the outer shell to `.plm-overlay` + `.plm-dialog dt-cast-modal`, remove ~35 lines of redundant CSS.

---

## Acceptance Criteria

1. The Cast Picker modal's outer backdrop uses `.plm-overlay` (backdrop-filter blur, fade-in animation).
2. The Cast Picker modal box uses `.plm-dialog` as base (gold border, box-shadow, border-radius, rise animation) with a `.dt-cast-modal` size-override modifier (`max-width: 420px; padding: 0; gap: 0; max-height: 80vh`).
3. The Cast Picker header uses `.plm-header` (gold divider, Cinzel heading).
4. The Cast Picker close button uses `.cd-close` (hover: accent + gold background).
5. The `.dt-cast-overlay`, `.dt-cast-modal-header`, `.dt-cast-modal-header h4`, `.dt-cast-modal-close` CSS blocks are removed from `player-layout.css` — they are replaced by the `.plm-*` base.
6. All Cast Picker content classes are preserved unchanged: `.dt-cast-filter`, `.dt-cast-filter-label`, `.dt-cast-list`, `.dt-cast-item`, `.dt-cast-att`, `.dt-cast-avatar`, `.dt-cast-info`, `.dt-cast-charname`, `.dt-cast-player`, `.dt-cast-check`, `.dt-cast-empty`, `.dt-cast-modal-footer`.
7. Cast Picker JS logic is unchanged — all `getElementById('dt-cast-overlay')` and `querySelector` calls still work (the `id="dt-cast-overlay"` stays on the overlay div).

---

## Tasks / Subtasks

- [x] Task 1: Update Cast Picker HTML in `downtime-form.js`

  **File:** `public/js/player/downtime-form.js`
  **Function:** `showCastPicker` (search for `Build modal HTML` comment, ~line 1581)

  Five class/tag substitutions in the render block:

  ```js
  // Line 1582 — overlay
  // Before:
  let h = '<div class="dt-cast-overlay" id="dt-cast-overlay">';
  // After:
  let h = '<div class="plm-overlay" id="dt-cast-overlay">';

  // Line 1583 — modal box
  // Before:
  h += '<div class="dt-cast-modal">';
  // After:
  h += '<div class="plm-dialog dt-cast-modal">';

  // Line 1584 — header
  // Before:
  h += '<div class="dt-cast-modal-header">';
  // After:
  h += '<div class="plm-header">';

  // Line 1588 — title tag (h4 → h3 to match .plm-header h3 styling)
  // Before:
  h += `<h4>${modalTitle}</h4>`;
  // After:
  h += `<h3>${modalTitle}</h3>`;

  // Line 1589 — close button
  // Before:
  h += '<button type="button" class="dt-cast-modal-close" id="dt-cast-close">\u00D7</button>';
  // After:
  h += '<button type="button" class="cd-close" id="dt-cast-close">\u00D7</button>';
  ```

  No other changes to `downtime-form.js` — JS logic, ids, and content classes are unchanged.

- [x] Task 2: Update Cast Picker CSS in `player-layout.css`

  **File:** `public/css/player-layout.css`
  **Section:** `/* ── Cast picker modal ── */` (~line 1981)

  Replace the entire Cast picker modal CSS block (`.dt-cast-overlay` through `.dt-cast-modal-close:hover`) with:

  ```css
  /* ── Cast picker modal ── */
  /* Outer backdrop: .plm-overlay (defined above)
     Modal box: .plm-dialog (defined above) + .dt-cast-modal size override */
  .dt-cast-modal {
    max-width: 420px;
    padding: 0;
    gap: 0;
    max-height: 80vh;
  }
  /* Header: .plm-header (defined above) — add inset padding since dialog padding is zeroed */
  .dt-cast-modal .plm-header {
    padding: 14px 18px 10px;
  }
  ```

  Keep everything from `.dt-cast-filter` onwards — those are content classes, not shell classes.

- [ ] Task 3: Manual verification
  - [ ] Open player downtime form, trigger the cast picker (sphere or action slot)
  - [ ] Confirm backdrop has blur effect (backdrop-filter)
  - [ ] Confirm modal has gold border + rise animation
  - [ ] Confirm header shows gold title + ✕ with hover highlight
  - [ ] Confirm filter, character list, and Confirm button work as before
  - [ ] Confirm clicking outside the modal closes it

---

## Dev Notes

### Why `.dt-cast-modal-footer` stays

`.dt-cast-modal-footer` has `border-top` + `padding` styling that is content-specific. It is not a structural shell class, so it stays. The class name is acceptable as a content-namespaced class (not a new modal _shell_ pattern).

### `.plm-dialog` base properties provided

By adding `.plm-dialog` as a base class on the modal box, these are supplied automatically:
- `background: var(--surf)` — surface colour ✅
- `border: 1px solid var(--bdr2)` — border ✅
- `box-shadow: 0 20px 60px ...` — drop shadow ✅
- `border-radius: 10px` ✅
- `display: flex; flex-direction: column` ✅
- `color: var(--txt)` ✅
- `animation: plm-rise 0.18s ease-out` ✅

`.dt-cast-modal` then overrides: `max-width` (420 instead of 640), `padding` (0, sections handle their own), `gap` (0 since sections have no inter-gap), `max-height` (80vh instead of 90vh).

### Why h4 → h3

`.plm-header h3` is the styled heading selector. The cast picker used `h4` historically for no semantic reason — the modal title is the primary heading in its context. Changing to `h3` picks up the Cinzel font + gold accent styling without adding a new rule.

### Lines removed from player-layout.css

Removing these blocks:
- `.dt-cast-overlay` (10 lines)
- `.dt-cast-modal` original (10 lines → replaced by 4-line override)
- `.dt-cast-modal-header` (7 lines)
- `.dt-cast-modal-header h4` (6 lines)
- `.dt-cast-modal-close` + `:hover` (10 lines)

Net: ~39 lines removed, 7 lines added.

### Key files

| File | Action |
|------|--------|
| `public/js/player/downtime-form.js` | 5 class/tag changes in `showCastPicker` render block |
| `public/css/player-layout.css` | Replace 5 CSS blocks with 2 override rules |

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes List
- `downtime-form.js` `showCastPicker`: 5 substitutions — `dt-cast-overlay` → `plm-overlay`, `dt-cast-modal` → `plm-dialog dt-cast-modal`, `dt-cast-modal-header` → `plm-header`, `<h4>` → `<h3>`, `dt-cast-modal-close` → `cd-close`; all ids and content classes unchanged
- `player-layout.css`: removed `.dt-cast-overlay` (10 lines), `.dt-cast-modal` original (10 lines), `.dt-cast-modal-header` (7 lines), `.dt-cast-modal-header h4` (6 lines), `.dt-cast-modal-close` + hover (10 lines); replaced with `.dt-cast-modal` size override (4 lines) + `.dt-cast-modal .plm-header` padding restore (3 lines); net −39 lines
- Rules Editor (`.rules-modal-*`) and GC Wizard (`.gc-wizard-*`) documented as intentionally out of scope

### File List
- `public/js/player/downtime-form.js`
- `public/css/player-layout.css`
- `specs/stories/cr.5.modal-theming-audit.story.md`
