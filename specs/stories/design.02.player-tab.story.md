# Story DS-02: Player Tab — editor.css + components.css

## Status
Ready for Dev

## Story
As an ST,
I want the Player tab (character sheet, editor, character cards) to use the three-font system and semantic colour tokens,
So that the Player tab is visually consistent with the validated design system and the parchment override block shrinks.

## Background

The Player tab is the heaviest CSS surface — it spans `editor.css` (~4700 lines) and `components.css`, covering panels 1-12 of the design system reference in `public/test layout/font-test.html`:

1. Character Header (name, player, tabs)
2. Attributes & Skills
3. Merits & Status
4. Form Labels & Inputs
5. Sheet Meta & Stats
6. Faction Display & Standing Merits
7. Character Card — Grid View
8. Disciplines
9. Expandable Rows & Detail
10. XP Economy
11. Influence & Domain
12. MCI Choice Buttons & Pools

Both files have large `html:not([data-theme="dark"])` parchment override blocks at the bottom. After this story, rules that are redundant because they now flow through theme-aware tokens are deleted from those blocks.

## Design Decisions

### Cinzel — display names only
Cinzel (`--fh`) stays only on the character name display (`.sh-char-name`, `.cc-name`, `.edit-charname`). All other current Cinzel uses — section titles, merit/discipline names, labels, tabs, faction names — move to Lato (`--fl`).

### Chip rule (9-Again, AoE, OHM)
Chips (`.chip`, `.sh-skill-na`, `.sh-spec-chip`) use Lato 600 small-caps 10px (synthesised small-caps is acceptable at 10px when the chip itself has a tinted bg/border that distinguishes it visually). Layout: `margin-left:auto` pushes the chip to the right of the dot row. Qualifier text (e.g. "+2 Armed Combat") sits left. Chip and qualifier are on the line beneath the heading dots.

### Dot rows
Dot-row headings: Lato, ALL CAPS or small-caps where at 12px+. Dots use `var(--accent)` (crimson parchment / gold dark). No font change to the dot characters themselves (unicode ●/○).

### MCI choice buttons
Active state (`.mci-choice-active`) uses `var(--accent)` for border and text colour — not hardcoded gold.

### Badge sizes
`.audit-badge` — dense list badge: Lato 9px 900 uppercase, `border-radius:3px`, `padding:2px 6px`.

### Faction icons
Components.css already uses the CSS mask + `background-color: var(--crim)` approach on parchment. That block stays — it cannot be replaced by a token because background-color is the mask fill, not a standard foreground colour.

### Parchment override block deletions
After the font and colour sweep, the following categories of rules become redundant and are removed from the `html:not([data-theme="dark"])` blocks:
- Cinzel weight floor rules that are now superseded by the `--fl` font-family (Lato has predictable weight rendering, no floor needed)
- Direct `--gold2` colour references now replaced by `var(--accent)`
- Hardcoded green/red result colours now replaced by `--result-succ`/`--result-pend` tokens

Rules that must stay (cannot be tokenised):
- Faction icon background-color (CSS mask approach — not a token)
- Topbar/edit icon filter override (SVG filter chains — not a token)
- `.exp-val { color: var(--txt); }` if `.exp-val` still needs pinning on parchment

## Files to Change

- `public/css/editor.css`
- `public/css/components.css`

## Acceptance Criteria

- [ ] No element in panels 1-12 uses `var(--fhd)` or `var(--fb)` — all replaced with `--fh`, `--fl`, or `--ft` as appropriate
- [ ] Cinzel is used only on character name display elements; all other Cinzel moved to Lato
- [ ] Chips (`.chip`, `.sh-skill-na`, `.sh-spec-chip`) use `--fl`, accent border/bg via `--accent-a40`/`--accent-a8`
- [ ] Dot colours use `var(--accent)` — hardcoded gold replaced in `.attr-dots-sh`, `.sh-skill-dots`, `.merit-dots-sh`, `.disc-tap-dots`, `.cov-strip-dot.active`
- [ ] Active/interactive states (tabs, skill flags, MCI active) use `var(--accent)` not `var(--gold2)`
- [ ] Status colours use semantic tokens: `--result-succ`, `--result-pend`, `--green-dk`, `--warn-dk` and their bg/bdr variants
- [ ] `--label-secondary` and `--label-tertiary` replace direct `--txt2`/`--txt3` usage on secondary and tertiary labels
- [ ] Parchment override blocks in both files are audited; redundant rules deleted
- [ ] No visual regressions in Player tab (both themes)
- [ ] Character cards render correctly in dark and parchment themes

## Tasks / Subtasks

### editor.css

- [ ] **Font sweep — `--fhd` → `--fh`**: Replace all 47 occurrences (use search-replace)
- [ ] **Font sweep — `--fb` → `--ft`**: Replace all occurrences
- [ ] **Cinzel → Lato on labels/headers**: Change `var(--fh)` → `var(--fl)` on:
  - Section titles: `.sh-sec-title`, `.sh-sec-subtitle`, `.attr-group-title`, `.skill-group-title`, `.xp-title`
  - Editor labels/tabs: `.edit-tab`, `.topbar-btn`, `.topbar-action`, `.topbar-title`
  - Attr/Skill names: `.attr-name`, `.skill-name`, `.skill-group-title`, `.skill-flag`
  - Sheet labels: `.sh-char-player`, `.sh-bane-add`, `.sh-ordeal`, `.sh-spec-counter`, `.sh-merit-cp-row`, `.sh-clan-attr-row`, `.sh-skill-name`, `.sh-skill-spec`, `.sh-stat-lbl`, `.sh-status-lbl`, `.sh-faction-sub`, `.sh-faction-bloodline`, `.cov-strip-name`
  - Disciplines: `.disc-tap-name`, `.disc-power-name`, `.disc-sub-head`, `.disc-clan-tag`, `.rite-free-badge`, `.rite-xp-badge`, `.dev-add-btn`, `.disc-cp-counter`
  - Merits: `.merit-name-sh`, `.merit-sub-sh`, `.merit-plain`, `.sk-spec-add`
  - XP/Audit: `.audit-badge`, `.sh-xp-breakdown th`
  - Contacts: `.contacts-edit-hdr`, `.contacts-dot-src`, `.infl-total`, `.mci-dot-lbl`, `.mci-pool-lbl`, `.mci-pool-val`
- [ ] **Keep Cinzel on**: `.sh-char-name`, `.edit-charname` (character name display only)
- [ ] **Colour sweep**: Replace `var(--gold2)` with `var(--accent)` in interactive/active states
- [ ] **Colour sweep**: Replace hardcoded `#6abf6a`, `rgba(106,191,106,...)` with `--result-succ` variants
- [ ] **Colour sweep**: Replace hardcoded `#c04040`, `#ff9090` with `--result-pend` variants
- [ ] **Colour sweep**: Replace hardcoded `#d4a832`, `rgba(212,168,50,...)` with `--warn-dk` variants
- [ ] **Colour sweep**: Replace `rgba(224,196,122,.15/.2/.4)` with `--accent-a8`/`--accent-a25`/`--accent-a40`
- [ ] **Chip styles**: Ensure `.chip`, `.sh-skill-na`, `.sh-spec-chip` use `--fl` 600 10px, `--accent-a40` border, `--accent-a8` bg
- [ ] **Audit parchment override block**: Delete rules made redundant by the sweep; keep faction icons, filter chains, `.exp-val` pin

### components.css

- [ ] **Font sweep — `--fhd` → `--fh`**: Replace all 10 occurrences
- [ ] **Font sweep — `--fb` → `--ft`**: Replace all occurrences
- [ ] **Cinzel → Lato**: `.cc-tag`, `.form-section-title`, `.form-label`, `.exp-lbl`, `.exp-val`, `.exp-wp-lbl`, `.exp-ts-hum`, `.list-count` — move to `--fl`
- [ ] **Keep Cinzel on**: `.cc-name` (character card name)
- [ ] **Colour sweep**: `.cc-name`, `.cc-tag.cov`, `.cc-tag.title` — `var(--crim)` → `var(--accent)`
- [ ] **Dot colours**: `.dot.filled` → `var(--accent)`, `.dot.bonus` → `var(--accent2)`, `.dot.empty` → `var(--accent-a25)` (replaces hardcoded 20% opacity)
- [ ] **Audit parchment override block**: Delete redundant rules after sweep; keep faction icon mask block and topbar filter override

## Dev Notes

- `editor.css` has ~47 `--fhd` occurrences — use editor search-replace for efficiency, then spot-check unusual contexts.
- The `html:not([data-theme="dark"])` Cinzel weight floor in `editor.css` exists because Cinzel rendered at thin weight on parchment's white background. Once those elements move to Lato, the weight floor for them is irrelevant and the rules can be deleted. Only keep weight floors for elements that remain on Cinzel.
- `.sh-char-name` uses an inline `color: var(--gold2)` in some JS render paths — the parchment override uses `!important` for this reason. Keep the `!important` on the `var(--accent)` replacement.
- Chips at 10px with synthesised small-caps: acceptable because the chip's tinted border+bg provides visual differentiation independent of cap rendering. If any chip renders illegibly below 10px, raise with designer before reducing further.
- Reference panels 1-12 in `public/test layout/font-test.html` as the visual spec throughout.
