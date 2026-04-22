# Story: ui.1 — Theme Sensitivity Fixes (Regent Names + Primer)

## Status: review

## Summary

Two elements in the game app don't respond correctly to light/dark theme switching:

1. **Regent and Lieutenant names** in the Regency tab use `color: var(--text, #ddd)` — `--text` is a typo (correct variable is `--txt`). The `#ddd` fallback is light grey, nearly invisible on the parchment/light background.

2. **Primer tab text** — investigation needed; primer CSS uses correct tokens (`var(--txt)`, `var(--accent)`, `var(--label-secondary)`), but the user reports it as unresponsive to theme. Likely a specificity or rendering issue to confirm in-browser.

---

## Scope

| Layer | Change |
|-------|--------|
| `public/css/components.css` | Fix `--text` typo → `--txt` on `.dt-residency-locked` |
| `public/css/suite.css` | Investigate and fix primer content colours if needed |

---

## Acceptance Criteria

1. Regent and Lieutenant names in the Regency tab are readable in both parchment and dark themes
2. Primer headings and body text respond correctly to theme switching
3. No regression to other residency row styles (feeding rights, over-cap warning)

---

## Tasks / Subtasks

- [x] Fix `.dt-residency-locked` typo (AC: #1)
  - [x] `components.css:1967` changed `color: var(--text, #ddd)` to `color: var(--txt)`
- [x] Audit and fix primer theme sensitivity (AC: #2)
  - [x] Root cause: `--rp-*` variables (--rp-bg, --rp-txt, --rp-head etc.) are only defined in parchment theme — no dark theme definitions exist. `.reading-pane` in dark mode gets undefined variables → invisible text.
  - [x] Pattern: `#t-downtime .reading-pane` already had dark override. Applied same to `#t-primer .reading-pane`.
  - [x] Added explicit h1/h2/h3/h4/p/ul/ol overrides for `#t-primer` using `var(--accent)`, `var(--txt2)`, `var(--txt)` — all dark-safe tokens.

---

## Dev Notes

### Regent/Lieutenant fix — `components.css:1965–1969`

```css
/* Current — broken */
.dt-residency-locked {
  flex: 1;
  color: var(--text, #ddd);   ← wrong: --text doesn't exist, falls back to #ddd
  font-style: italic;
}

/* Fix */
.dt-residency-locked {
  flex: 1;
  color: var(--txt);           ← correct token
  font-style: italic;
}
```

### Primer colour tokens (suite.css:1514–1517)

These already use correct tokens — confirm in-browser before changing:
- `h1, h2`: `var(--accent)` ✓
- `h3, h4`: `var(--label-secondary)` — parchment: `#5a4a3a`, dark: `var(--txt2)`
- `p`, `ul`, `ol`: `var(--txt)` ✓

If `--label-secondary` in parchment (`#5a4a3a`) is not visible enough, change h3/h4 to `var(--txt2)` which adapts across both themes without needing per-theme overrides.

### Theme variable reference (theme.css)
- Parchment: `--label-secondary: #5a4a3a`
- Dark: `--label-secondary: var(--txt2)`
- `--txt` adapts correctly in both themes

---

## Dev Agent Record

### Agent Model Used
claude-sonnet-4-6

### Debug Log

### Completion Notes

- `components.css`: `dt-residency-locked` was using `var(--text, #ddd)` — wrong variable name + bad fallback. Fixed to `var(--txt)`.
- `suite.css`: Primer uses `.reading-pane` which relies on `--rp-*` variables that only exist in parchment theme. Added `#t-primer .reading-pane` dark override (matching the existing `#t-downtime` pattern) + explicit h1-h4/p/ul/ol overrides using dark-safe tokens.

### File List

- `public/css/components.css`
- `public/css/suite.css`

### Change Log

- 2026-04-23: Implemented ui.1 — fixed regent/lieutenant name colour + primer dark theme
