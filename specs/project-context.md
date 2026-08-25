# Project Context — Critical Implementation Standards

This file is auto-loaded as a persistent fact by the BMAD story and dev agents
(`bmad-create-story`, `bmad-dev-story` — see their `customize.toml`
`persistent_facts`). Anything here is read on every story/dev run. Keep it short
and high-signal: the standards an implementer must NOT violate.

---

## 1. Normalised CSS — reuse the design system, never write ad-hoc styles

The app has a normalised CSS design system. New UI that ignores it (inline
styles, bare hex, one-off classes) is a defect, not a shortcut. Before writing
ANY markup or styling:

1. **Use tokens, never literals.** All colours/fonts/spacing come from the
   `:root` custom properties in `public/css/theme.css`
   (`var(--txt)`, `var(--surf2)`, `var(--accent)`, `var(--gold2)`, `var(--fh)`,
   etc.). Never write a hex value, `rgba(...)`, or font name in a rule body or in
   a JS-generated `style="..."` attribute. The only place hex is allowed is the
   `:root` / `[data-theme="dark"]` blocks in `theme.css`.
2. **Reuse an existing component class before inventing one.** Grep
   `public/css/components.css` (shared) and the app stylesheet
   (`suite.css` / `admin-layout.css`) for an analogous element first. Common
   reusable classes (verify in the CSS before use):
   - Buttons: `.dt-btn` (admin actions), `.nbtn` (suite nav)
   - Inputs: `.form-input`, `.form-select`, `.form-label`, `.form-section`
   - Cards/grids: `.char-card`, `.char-grid`, `.char-chip`
   - Dots: `.dot-stepper`, `.pointed` / `.pointed.hollow` (display: `●`/`○`)
   - Expandable rows: `.exp-row` (+ `.exp-row.open`)
   - Merit breakdown: `.merit-bd-row` + `.bd-grp`/`.bd-lbl`/`.bd-eq`/`.bd-val`
   - Sheet/section: `.sh-sec`, `.form-section-title`
   - Influence/merits: `.infl-edit-row`, `.infl-tier-chip`, `.mci-block`,
     `.dom-edit-block`
   - DT processing panels: `.proc-feed-mod-panel`, `.proc-pool-builder`
     (grouped chrome — add to the canonical group, don't fork)
   - Derived/annotation: `.derived-note`
3. **Styling from JavaScript:** render functions build HTML strings. Apply a
   **class**, never an inline `style="color:#..."`. If the needed style does not
   exist as a class, add it to the right stylesheet using tokens, then apply the
   class. Do not inline. This applies equally to the DOM API: `el.style.cssText`
   and `el.style.color = '#fff'` are the same violation in different syntax, and
   `var(--token, #hex)` is the only compliant literal shape. Two standing
   exemptions exist (`print.js`'s embedded print stylesheet, `console.log('%c')`
   banners); both are registered under `coding-standards.md` → CSS Standards →
   Documented exemptions, and `server/tests/gdx-4-css-standards-grep.test.js`
   enforces the whole rule.
4. **New shared chrome goes in a grouped selector**, not duplicated rule bodies
   (see `coding-standards.md` → Shared Chrome Pattern).

**Authoritative reference:** `specs/architecture/coding-standards.md` → "CSS
Standards" (tokens, component reuse, styling-from-JS, shared chrome, naming).
Token source of truth: `public/css/theme.css`.

If a story touches UI, its implementation is not complete until every colour,
font, and spacing value is a token and every element reuses or properly extends
the component system.

---

## 2. Other non-negotiables (see the linked SSOT for detail)

- **British English** throughout (Defence, Armour, Vigour, Honour, Socialise).
  No em-dashes in player-facing output text.
- **Derived stats are never stored** — health/vitae/willpower max, influence
  total, XP are computed at render time. (Sanctioned exception: ST-mod overlay,
  ADR-004.)
- **Reference data has one home** — `FEED_METHODS` / `TERRITORY_DATA` live in
  `public/js/tabs/downtime-data.js`; import, never duplicate. Full SSOT map:
  `specs/reference-data-ssot.md`.
- **Effective ratings** (dots + bonus) are read for pools/prereqs; bonus dots are
  real dots.
- Targeted tests only for the changed area; never the full suite for a small
  change. No `| tail` on test runs (capture to a file, check the exit code).
