# Story fix.649: Normalise vertical padding and container widths in character sheet editor

## Status: review

## Metadata

```yaml
issue: 649
issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/649
branch: ms/issue-649-normalise-editor-css-padding
```

## Story

**As an** ST editing a character sheet in admin,
**I want** consistent vertical spacing between editor sections and consistent field widths,
**so that** the editor feels polished and easy to scan without jarring gaps or misaligned containers.

## Acceptance Criteria

1. **Given** any two adjacent `.form-section` blocks in the editor, the vertical gap between them is visually consistent — no section is flush against the next while others have breathing room.
2. **Given** any text input, `<select>`, or `<textarea>` inside an editor column, it fills its column container with no unexplained width discrepancies between left-column and right-column fields.
3. **Given** edit rows (attribute rows, skill rows, influence rows, general merit rows), their vertical padding is consistent with the canonical `5px 0` pattern, and horizontal padding deviations are either normalised or have a comment explaining the intent.
4. No new CSS classes are introduced — changes are confined to existing selectors in `public/css/components.css`.
5. No visual regressions in any editor tab (Identity, Attributes, Skills, Disciplines, Merits, General).

## Tasks

- [x] **Task 1 — Audit and document** the exact selectors to change (list in dev agent record before touching anything). Confirm the canonical values:
  - Section gap: `.form-section { margin-bottom: 28px }` is the existing canonical — verify all editor tabs actually wrap content in `.form-section`.
  - Row vertical padding: `5px 0` (`.attr-row`, `.skill-row`) is canonical for bordered rows.
  - Block margin (`.mci-block`, `.pt-block`, `.dom-edit-block`): currently `4–6px`, which is a *within-block* gap — intentionally tighter than section gaps. Document this distinction.

- [x] **Task 2 — Fix inter-section vertical gaps** in `public/css/components.css`:
  - Ensure every major visual "chapter" in each editor tab uses `.form-section` so the 28px gap applies consistently. Where a section wrapper is missing, the fix is in the JS renderer (see Task 3), not the CSS.
  - Remove any ad-hoc `margin-top` / `padding-top` overrides on `.etab > *` that duplicate or override the `.form-section` gap.

- [x] **Task 3 — Fix missing `.form-section` wrappers** in JS renderers (if Task 1 reveals bare sections not wrapped):
  - Files: `public/js/editor/identity.js`, `public/js/editor/attrs-tab.js`, `public/js/editor/mci.js`, `public/js/editor/edit-domain.js`
  - Pattern: each logical section should open with `<div class="form-section"><div class="form-section-title">...</div>` and close at the end.
  - Identity.js already uses this correctly (lines 25, 62, 99, 122, 147) — use as the reference pattern.

- [x] **Task 4 — Normalise `.infl-edit-row` and `.gen-edit-row` row padding** in `components.css`:
  - `.infl-edit-row` (line 315): `padding: 5px 8px` — the `8px` horizontal is intentional (slight indent for boxed rows); document with a comment.
  - `.gen-edit-row` (line 371): `padding: 4px 8px` — align vertical to `5px` to match the other edit rows: `padding: 5px 8px`.
  - Keep `.attr-row` and `.skill-row` at `5px 0` (no horizontal padding — they sit in a grid column with its own spacing).

- [ ] **Task 5 — Visual smoke test**: Open admin, load any character in edit mode, scroll through all tabs (Identity, Attributes/Skills, Disciplines, Merits, General). Confirm:
  - All sections have consistent breathing room between them.
  - All input/select fields fill their column width.
  - No regressions in layout (no fields overlapping, no broken columns).

## Dev Notes

### File map

| File | Role | Concern |
|------|------|---------|
| `public/css/components.css` | All editor styles | Primary change target |
| `public/js/editor/identity.js` | Identity tab HTML | Reference pattern for `.form-section` usage |
| `public/js/editor/attrs-tab.js` | Attrs/Skills HTML | Reference pattern |
| `public/js/editor/mci.js` | MCI block HTML | Check for missing `.form-section` wrapper |
| `public/js/editor/edit-domain.js` | Domain merits HTML | Check for missing wrapper |

### Current spacing inventory (from audit)

```
components.css key rules:

Line 35:  .form-section          { margin-bottom: 28px }          ← canonical section gap
Line 36:  .form-section-title    { margin-bottom: 14px; padding-bottom: 6px }
Line 160: #v-edit.active         { padding: 0 }
Line 161: .edit-header           { padding: 12px 24px }
Line 171: .edit-body             { padding: 24px 32px 48px }      ← 48px bottom is intentional (scroll space)
Line 176: .attr-grid             { gap: 20px }
Line 178: .attr-row              { padding: 5px 0 }               ← canonical bordered row
Line 182: .skill-grid            { gap: 20px }
Line 184: .skill-row             { padding: 5px 0 }               ← canonical bordered row
Line 315: .infl-edit-row         { padding: 5px 8px; margin-bottom: 3px }
Line 342: .mci-block             { padding: 8px 10px; margin-bottom: 6px } ← within-block, intentionally tight
Line 371: .gen-edit-row          { padding: 4px 8px }             ← 4px deviant; fix to 5px
Line 394: .pt-block              { padding: 8px 10px; margin-bottom: 6px } ← within-block, intentionally tight
Line 405: .dom-edit-block        { padding-bottom: 4px; margin-bottom: 4px }
Line 1672: .qf-field             { margin-bottom: 22px }          ← questionnaire only, OK to leave
Line 1698: .qf-input/textarea/select { width: 100%; padding: 10px 12px }
Line 213: .sh-edit-input         { width: 100%; padding: 4px 8px }
Line 215: .sh-edit-select        { width: 100%; padding: 4px 8px }
```

### Intentional deviations to preserve (not bugs)

- `.mci-block`, `.pt-block`: `margin-bottom: 6px` — these are rows *within* a standing-merit block, not top-level sections. Tighter spacing is correct.
- `.dom-edit-block`: `margin-bottom: 4px` — same reasoning, within-block rows.
- `.edit-body`: `padding-bottom: 48px` — extra bottom scroll space so the last field is not flush with the viewport edge.
- `.infl-edit-row`: `padding: 5px 8px` — horizontal 8px gives the influence row a slight indent that matches the visual box. Keep; just add a comment.
- `.qf-field`: `margin-bottom: 22px` — questionnaire-specific, acceptable at the higher value for form readability.

### Identity tab renders correctly already — use as reference

`public/js/editor/identity.js` wraps every section in `.form-section`:
- Line 25: Identity
- Line 62: Lineage & Covenant
- Line 99: Persona
- Line 122: Experience (XP)
- Line 147: Status

This means the vertical gap in the identity tab is already driven by `.form-section { margin-bottom: 28px }`. If sections look flush in the browser, check whether an override in `admin-layout.css` collapses the margin.

### No new test file needed

This is a pure CSS/HTML-template change with no logic. Verification is manual (smoke test, Task 5). There is no Playwright-testable behaviour change.

### CSS conventions

- **British English**: Honour, Defence, etc. in any comments.
- **No bare hex** in rule bodies — use CSS custom properties (`var(--bdr)`, `var(--surf2)`, etc.).
- **Minimise comment noise** — only add a comment where the value is non-obvious (e.g. the intentional deviations listed above).
- Changes confined to `public/css/components.css`. Do not touch `admin-layout.css` unless a clear layout regression requires it.

---

## Change Log

| Date | Version | Description | Author |
|------|---------|-------------|--------|
| 2026-06-09 | 1.0 | Story created from issue #649 | SM |
| 2026-06-09 | 1.1 | Implementation: `.gen-edit-row` padding normalised to 5px; `.infl-edit-row` intent documented | Dev |

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Completion Notes
- **Task 1 (Audit):** Confirmed `.form-section { margin-bottom: 28px }` is canonical. Both `identity.js` (5 sections) and `attrs-tab.js` (2 sections) already use `.form-section` correctly. `mci.js` and `edit-domain.js` are logic/handler modules with no tab HTML to wrap — no changes needed. Disciplines and Merits editor views intentionally use `sh-sec` (sheet section class) as they share rendering code with the sheet view. No ad-hoc `.etab > *` overrides found in `admin-layout.css`.
- **Task 2 (Inter-section gaps):** No ad-hoc overrides to remove. `.etab` rules are clean (`display: none/block` only).
- **Task 3 (JS wrappers):** No missing wrappers. All tab renderers already use `.form-section` where applicable.
- **Task 4 (Row padding):** Changed `.gen-edit-row` from `padding: 4px 8px` → `padding: 5px 8px` (aligns with `.attr-row`, `.skill-row`, `.infl-edit-row`). Added inline comment to `.infl-edit-row` documenting the intentional 8px horizontal indent.
- **Task 5:** Manual smoke test — deploy to dev and verify in admin edit mode.

### File List
- `public/css/components.css`
