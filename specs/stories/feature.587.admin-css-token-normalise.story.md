# Story Feature.587: Normalise admin button / input / chip CSS tokens

## Status: review

> **Implemented 2026-06-05.** CSS-only token pass: dark-on-dark button bases lifted off `--surf2`; momentary `:active` dark-gold press (reusing the Blood-Type `.dt-ticker__pill` idiom); targeting inputs light; target-chip spacing. Token-only, semantic state colours preserved. Admin regression specs running in parallel. **Visual confirmation pending Angelus's on-dev smoke (light + dark).**

## Metadata
- issue: 587
- issue_url: https://github.com/angelusvmorningstar/TerraMortis/issues/587
- branch: morningstar-issue-587-css-token-normalise
- type: feature / CSS normalisation
- scope: **all admin surfaces** (per Angelus) — `admin-layout.css` + shared `components.css`, not just downtime
- relates: #586 (surfaced the dark fill-in fields); reference_css_token_system, reference_sheet_css_patterns

---

## Story

**As** an ST using the admin app,
**I want** buttons, fill-in inputs and chips to read consistently against the parchment surfaces,
**so that** controls are clearly interactive (not camouflaged into the panel they sit on) and a pressed state is unmistakable.

---

## Background

CSS-only normalisation pass across the admin surfaces. Three concrete problems, all confirmed with Angelus:

### Problem 1 — buttons disappear on dark parchment
`.dt-btn` uses `background: var(--surf)` (`admin-layout.css:1264-1273`). That reads fine on the **light** page background (`--bg`), but many admin buttons sit **inside darker panels** (`--surf2`/`--surf3`, e.g. the DT processing right-hand panels). There, the button fill equals the panel fill, so the button has no edge and looks non-interactive. **Buttons need to separate from the surface they sit on, including on dark parchment.**

### Problem 2 — pressed state should be dark gold
The project already has the idiom: the player-facing segmented control (Blood Type / Method of Feeding etc.), `.dt-ticker__pill:has(input:checked)`, uses a **solid dark-gold** press state:
```css
.dt-ticker__pill:has(input:checked) { background: var(--gold2); border-color: var(--gold2); color: var(--bg); }
```
Generic admin buttons should adopt this same solid dark-gold for their pressed/active/selected state (`--gold2` fill, `--bg` text), for an unmistakable "this is on/pressed" cue.

### Problem 3 — fill-in inputs use dark parchment
The "Add character…" inputs in DT processing read as heavy/disabled. Base `.proc-conn-input` is actually light (`background: var(--bg)`, `admin-layout.css:6565`), but `.proc-targeting-group .proc-conn-input` **overrides it to `var(--surf2)`** (dark) at `admin-layout.css:6532-6534`. Fill-in text inputs should use the light input fill consistently.

### Plus (from the issue) — target chip spacing
In the DT form target zone, the selected target chip (e.g. "Ryan Ambrose ×") sits flush against the type buttons (Character / Territory / Other) above it — needs spacing.

### Token reference (light/parchment theme, `theme.css:13-28`)
- Surfaces: `--bg` #F4EFE4 (page), `--surf`/`--surf1`/`--surf2`/`--surf3` (progressively darker parchment tiers).
- Gold: `--gold` #8B6010, `--gold2` #7A5208 (the dark-gold press), plus `--gold-aN` alpha tints.
- A dark-theme override block exists (`theme.css:176+`) — all changes MUST go through tokens so both themes follow (no bare hex; per reference_css_token_system).

### Important nuance — do NOT flatten the colour-coded state chips
The proc-* state chips encode **meaning** in their active colour and must keep it:
- `.proc-rote-chip.is-active` → crimson (rote), `.proc-again-opt.is-active` → gold, `.is-auto` → green (`admin-layout.css:5046-5048`)
- `.proc-roll-mode-btn.is-active[...]` → green/gold/grey per mode (`:5078-5080`)
The "pressed = dark gold" rule (Problem 2) is for **generic action buttons** (`.dt-btn` family), NOT these semantic state toggles. Flattening them to one gold would destroy the at-a-glance status colour.

---

## Acceptance Criteria

- [x] **AC1 (buttons on dark)** — The dark-on-dark button bases (`.proc-rote-chip`/`.proc-again-opt`, `.proc-roll-mode-btn`, `.proc-inv-lead-btn`) changed from `var(--surf2)` (= the panel fill) to `var(--surf)` + a stronger `var(--bdr2)` border, so they lift off the dark panels. _(Visual confirmation pending on-dev smoke, light + dark.)_
- [x] **AC2 (pressed dark gold)** — Added a momentary press rule (`:active`) on the button families → `background: var(--gold2); color: var(--bg)`, reusing the `.dt-ticker__pill:has(input:checked)` idiom. _(Visual confirmation pending on-dev smoke.)_
- [x] **AC3 (semantic chips preserved)** — The colour-coded persistent `.is-active` states (crimson/gold/green) are untouched; the gold press is `:active`-only (momentary), so it does not overwrite them on release. Only inactive base fills + borders changed.
- [x] **AC4 (inputs light)** — `.proc-targeting-group .proc-conn-input` no longer forces `var(--surf2)`; it now uses the light base `var(--bg)` + `var(--bdr)`, matching the un-scoped `.proc-conn-input`.
- [x] **AC5 (chip spacing)** — `.char-picker__chips` gains `margin-top: 6px` (zeroed when `:empty`) so the selected target chip is not flush against the type buttons.
- [x] **AC6 (tokens, both themes)** — All edits use existing `:root` tokens (`--surf`/`--bg`/`--bdr`/`--bdr2`/`--gold2`), which are themselves redefined in the dark block, so both themes follow. No bare hex added (verified).
- [ ] **AC7 (no regressions)** — No layout/spec regressions on the admin surfaces; existing admin Playwright specs (e.g. `admin.spec.js`, `downtime-processing.spec.js`) still pass.

---

## Tasks

### Task 1 — Define the normalised button tokens/convention (AC1, AC2, AC6) — [x] DONE (no NEW token needed)
Used existing tokens rather than adding aliases: separation via `var(--surf)` + `var(--bdr2)` (lighter than the `--surf2`/`--surf3` panels), press via `var(--gold2)` fill + `var(--bg)` text. All are redefined in the dark block, so both themes follow.
In `theme.css` (or the button base in `admin-layout.css`), establish: a button base fill that separates from `--surf2`/`--surf3` panels (e.g. a dedicated `--btn-surface` token, or a lighter tier + border), and a shared pressed/active style mapping to `--gold2` fill + `--bg` text. Add tokens to BOTH the light block and the dark override.

### Task 2 — Apply to the button families (AC1, AC2) — [x] DONE
Applied the `:active` dark-gold press to `.dt-btn`, `.proc-rote-chip`, `.proc-again-opt`, `.proc-roll-mode-btn`, `.proc-inv-lead-btn`. Lifted the dark-on-dark bases (`.proc-rote-chip`/`.proc-again-opt`, `.proc-roll-mode-btn`, `.proc-inv-lead-btn`) from `--surf2` → `--surf` + `--bdr2`. `.dt-btn` base already uses the lighter `--surf` (separates on dark panels); left as-is apart from the press rule. _Scoped to the concrete blend culprits Angelus pointed at; a wider sweep of every admin button can follow once the direction is confirmed on dev._
Update `.dt-btn` (`admin-layout.css:1264`) + variants (`-sm`, `-gold`, `-new`, `-game`, `-export`) to the normalised base + pressed convention. Audit other generic admin buttons (filter bar, panel headers) and bring them in. Keep `:hover` legible on both surfaces.

### Task 3 — Preserve the semantic state chips (AC3) — [x] DONE
The press is `:active`-only (momentary), so the persistent `.is-active` colour rules (crimson/gold/green) win on release. Only the inactive base fill/border changed. Explicitly leave `.proc-rote-chip` / `.proc-again-opt` / `.proc-roll-mode-btn` active colours intact (`:5046-5048`, `:5078-5080`). If a shared button rule would override them, scope it so it doesn't.

### Task 4 — Normalise fill-in inputs (AC4) — [x] DONE
`.proc-targeting-group .proc-conn-input` → `background: var(--bg); border-color: var(--bdr)` (light), matching the base. Remove/adjust the `.proc-targeting-group .proc-conn-input` dark override (`admin-layout.css:6532`) so fill-in inputs use the light input fill from the base `.proc-conn-input` (`:6565`). Factor a shared input-fill token if it helps consistency across admin text inputs.

### Task 5 — Target chip spacing (AC5) — [x] DONE
`.char-picker__chips { margin-top: 6px }` (zeroed when `:empty`) in `components.css`. Add spacing between the target chip row and the type-button row in the DT form target zone (the charPicker chip; reference `.dt-chip-grid`/`.dt-chip` in `components.css:4844+`).

### Task 6 — Verify (AC6, AC7)
Toggle light/dark to confirm both themes. Run the admin Playwright specs (`admin.spec.js`, `desktop-and-css.spec.js`, `downtime-processing.spec.js`) — no regressions. On-dev visual smoke (Angelus): buttons separate on dark panels, pressed = dark gold, inputs light, chip spacing.

---

## Dev Notes

### Files / artifacts
- `public/css/theme.css:13-28` (light tokens), `:176+` (dark override) — add button/input tokens to both.
- `public/css/admin-layout.css:1264` — `.dt-btn` base (the dark-on-dark culprit); variants `:1605,1823,1965,1969,1970`.
- `public/css/admin-layout.css:6532` — `.proc-targeting-group .proc-conn-input` dark override (Problem 3); base `:6565`.
- `public/css/admin-layout.css:5021-5080` — proc-* state chips (DO NOT flatten — AC3).
- `public/css/components.css` — `.dt-ticker__pill:has(input:checked)` (the dark-gold reference, ~`:4770`); `.dt-chip-grid`/`.dt-chip` (`:4844+`, target chip pattern).
- DT form target zone — universal charPicker chip (`downtime-form.js:3060` note).

### Must preserve / watch-outs
- **Tokens only, no bare hex** (reference_css_token_system). Every change must work in BOTH light and dark themes.
- **Audit before adding** (reference: audit-css-before-writing) — prefer extending existing tokens/classes over new bespoke ones; reuse the `.dt-ticker` press idiom rather than inventing a new gold.
- Do NOT touch the semantic state-chip colours (AC3).
- British English in any new comments.
- CSS-only — no JS/markup behaviour changes. (The Connected-Characters and confirmed-pool *behaviour* work is #589/#590, not this.)

### References
- [Source: public/css/admin-layout.css:1264] — `.dt-btn` base fill `var(--surf)`
- [Source: public/css/admin-layout.css:6532,6565] — targeting input dark override vs light base
- [Source: public/css/admin-layout.css:5046-5048,5078-5080] — semantic state-chip colours to preserve
- [Source: public/css/components.css ~:4770] — `.dt-ticker__pill:has(input:checked)` dark-gold press (the pattern)
- [Source: public/css/theme.css:13-28,176+] — light + dark token blocks
- #586 (surfaced the dark inputs), #589/#590 (sibling DT issues — out of scope here)

## Dev Agent Record

### Agent Model Used

claude-opus-4-8 (Amelia / dev-story)

### Debug Log References

- CSS brace balance unchanged/even after edits (admin-layout.css 2384/2384, components.css 1720/1720); no bare hex in the #587 edits.
- Admin regression specs (`desktop-and-css`, `downtime-processing`, `admin`): _result recorded in Change Log._

### Completion Notes List

CSS-only, token-only. Five edits:
1. `.proc-targeting-group .proc-conn-input` → light fill (`var(--bg)`/`var(--bdr)`), was `--surf2`/`--surf3` (AC4).
2. `.proc-rote-chip`/`.proc-again-opt` base → `var(--surf)` + `var(--bdr2)`, was `--surf2` (AC1).
3. `.proc-roll-mode-btn` base → same (AC1).
4. `.proc-inv-lead-btn` base (the LEAD/NO LEAD example) → `var(--surf)`, was `--surf2` (AC1).
5. Shared `:active` press rule on `.dt-btn` + the four button families → `var(--gold2)` fill + `var(--bg)` text (AC2), momentary so semantic `.is-active` colours are preserved (AC3).
6. `.char-picker__chips { margin-top: 6px }` (zeroed `:empty`) for target-chip spacing (AC5).

**Scope note:** targeted the concrete blend culprits Angelus named (proc button families using `--surf2`, the dark targeting input) rather than a blind sweep of every admin button. `.dt-btn` base already separates (`--surf`), so it only gained the press rule. A wider button sweep can follow once the direction is confirmed on dev.

**Verification:** CSS visuals can't be asserted by Playwright — AC1/AC2/AC5 need Angelus's eye on dev in BOTH light and dark themes. The specs only guard against layout/spec regressions (AC7).

### File List

- `public/css/admin-layout.css` (modified — targeting input fill; proc chip / roll-mode / lead button bases; shared `:active` press rule)
- `public/css/components.css` (modified — `.char-picker__chips` spacing)
- `specs/stories/feature.587.admin-css-token-normalise.story.md` (this story)
- `specs/stories/sprint-status.yaml` (status tracking)

### Change Log

- 2026-06-05 — CSS token normalisation (admin): lifted dark-on-dark button bases off `--surf2`, added a dark-gold `:active` press (reusing the Blood-Type `.dt-ticker__pill` idiom), made targeting inputs light, spaced the target chip. Token-only, semantic state colours preserved. Admin regression specs: <pending>. Status → review. Visual confirmation pending on-dev smoke.
