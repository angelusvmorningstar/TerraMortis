# Story DS-01: Add Semantic Tokens to theme.css

## Status
Ready for Dev

## Story
As an ST,
I want semantic font and colour tokens defined in theme.css,
So that all subsequent design system stories have a stable token foundation to build on.

## Background

The current `theme.css` defines `--fh` (Cinzel) and `--fhd` (Cinzel Decorative) but has no `--fl` (Lato) or `--ft` (Libre Baskerville). Colour decisions — interactive states, status indicators, success/warning/pending colours — are hardcoded hex or rgba values scattered across CSS files with per-file parchment overrides at the bottom.

The design system validated in `public/test layout/font-test.html` uses three fonts only and a set of semantic colour tokens that are theme-aware. All 11 subsequent stories (DS-02 through DS-12) depend on these tokens being present in `theme.css` before any sweep begins.

`--fhd` and `--fb` are kept in `:root` during the transition period so that existing rules that reference them continue to work while each tab story performs its sweep. They are removed in the final cleanup pass once DS-02 through DS-12 are done.

## Design Decisions

- **Three fonts only**: Cinzel (`--fh`), Lato (`--fl`), Libre Baskerville (`--ft`). Courier New (`--fm`) is not added — it was proposed but cut from the system.
- **`--fhd` and `--fb` preserved for now**: Left in `:root` as aliases pointing to `--fh` and `--ft` respectively so dependent rules don't break during the transition. Each tab story removes usages as it sweeps its files.
- **`--accent` parchment = `var(--crim)`**: Crimson (#7A0000) replaces gold in all interactive/active states on parchment. Dark theme keeps `var(--gold2)` (#E0C47A).
- **`--label-secondary` and `--label-tertiary`**: Improved contrast for secondary and tertiary text, replacing direct `--txt2`/`--txt3` use.
- **Google Fonts**: All three HTML files currently load Cinzel + Cinzel Decorative + Lora. Lora is removed; Lato (wght 400;600;700;900) and Libre Baskerville (wght 400;700) are added.

## Files to Change

- `public/css/theme.css`
- `public/admin.html`
- `public/player.html`
- `public/index.html`

## Acceptance Criteria

- [ ] `--fl` and `--ft` are defined in `:root` in `theme.css`
- [ ] `--fhd` and `--fb` remain in `:root` (pointing to `--fh` and `--ft`) — no regressions from existing Cinzel Decorative or Lora usages
- [ ] All semantic colour tokens are defined in `:root` (parchment values) and overridden in `[data-theme="dark"]`
- [ ] Google Fonts URL in `admin.html`, `player.html`, `index.html` includes Lato and Libre Baskerville; Lora is removed
- [ ] Admin app, player portal, and suite app render without visual regressions in both themes
- [ ] No existing rule breaks (token additions only — no removals)

## Tasks / Subtasks

- [ ] **Update Google Fonts URLs** in `admin.html`, `player.html`, `index.html`
  - Remove `Lora:ital,wght@0,400;0,500;1,400`
  - Add `Lato:wght@400;600;700;900`
  - Add `Libre+Baskerville:wght@400;700`
- [ ] **Add font tokens to `theme.css` `:root`**
  - `--fl: 'Lato', sans-serif;`
  - `--ft: 'Libre Baskerville', serif;`
  - Update `--fhd` to alias `--fh`: `--fhd: var(--fh);`
  - Update `--fb` to alias `--ft`: `--fb: var(--ft);`
- [ ] **Add semantic colour tokens to `theme.css` `:root`** (parchment values)
  - `--accent: var(--crim);`
  - `--accent2: var(--crim2);`
  - `--accent-a8: rgba(122,0,0,.08);`
  - `--accent-a25: rgba(122,0,0,.25);`
  - `--accent-a40: rgba(122,0,0,.40);`
  - `--label-secondary: #5a4a3a;` (warm mid-brown, readable on parchment bg)
  - `--label-tertiary: #8a7060;` (muted warm tone)
  - `--result-succ: #2e7d32;`
  - `--result-succ-bg: rgba(46,125,50,.10);`
  - `--result-succ-bdr: rgba(46,125,50,.35);`
  - `--result-pend: #c04040;`
  - `--result-pend-bg: rgba(192,64,64,.10);`
  - `--result-pend-bdr: rgba(192,64,64,.35);`
  - `--green-dk: #1b5e20;`
  - `--green-dk-bg: rgba(27,94,32,.12);`
  - `--green-dk-bdr: rgba(27,94,32,.35);`
  - `--warn-dk: #7a5c00;`
  - `--warn-dk-bg: rgba(122,92,0,.12);`
- [ ] **Add dark overrides to `[data-theme="dark"]`**
  - `--accent: var(--gold2);`
  - `--accent2: var(--gold);`
  - `--accent-a8: rgba(224,196,122,.08);`
  - `--accent-a25: rgba(224,196,122,.25);`
  - `--accent-a40: rgba(224,196,122,.40);`
  - `--label-secondary: var(--txt2);`
  - `--label-tertiary: var(--txt3);`
  - `--result-succ: #6abf6a;`
  - `--result-succ-bg: rgba(106,191,106,.12);`
  - `--result-succ-bdr: rgba(106,191,106,.35);`
  - `--result-pend: #ff9090;`
  - `--result-pend-bg: rgba(255,144,144,.12);`
  - `--result-pend-bdr: rgba(255,144,144,.35);`
  - `--green-dk: #6abf6a;`
  - `--green-dk-bg: rgba(106,191,106,.15);`
  - `--green-dk-bdr: rgba(106,191,106,.40);`
  - `--warn-dk: #d4a832;`
  - `--warn-dk-bg: rgba(212,168,50,.15);`

## Dev Notes

- The `html:not([data-theme="dark"])` parchment override blocks in `editor.css`, `components.css`, `admin-layout.css`, `player-layout.css` are untouched in this story. Each tab story handles its own override block.
- The Google Fonts `display=swap` parameter should be preserved.
- Libre Baskerville italic variant is not loaded — only normal weight (400 and 700). The design system does not use italic.
- After this story is merged, run a quick smoke test on both admin.html and player.html in dark and parchment themes to confirm no font fallbacks (check DevTools Network for 404s on font files).
