# Story DS-04: Downtime Tab — admin-layout.css Downtime Section

## Status
Ready for Dev

## Story
As an ST,
I want the Downtime tab (submissions, processing panel, projects, feeding matrix) to use the three-font system and semantic colour tokens,
So that the Downtime tab is visually consistent with the validated design system.

## Background

The Downtime tab covers panels 16-20 of the design system reference:

16. DT Submissions (submission list, row layout)
17. DT Processing Panel (expanded proc row — the heavy ST workflow panel)
18. Modifiers & Projects
19. Dice Roll Engine (roll modal)
20. Feeding Matrix

All CSS is in `admin-layout.css`. This is the highest-complexity tab story because the processing panel (`proc-*` selectors) has the most diverse element types: status badges, interactive buttons, modals, pool displays, ambience chips, checklist rows.

Prerequisite: DS-01 must be complete.

## Design Decisions

- **Roll count display** (`.roll-count`): Currently `--fhd` 48px. The big success number is a display-prominent numeric result, not a character name or entity. Move to `--fl` (Lato 700 or 900) — it reads as a strong label/score, not a proper noun. Cinzel is reserved for entity names.
- **Roll modal title** (`.roll-title`): Move to `--fl`. It's a UI label ("Rolling: Dexterity + Athletics").
- **Processing section titles** (`.proc-mod-panel-title`, `.proc-feed-lbl`, `.proc-amb-title`): All section headers → `--fl`.
- **Submission character names** (`.proc-row-char`): This is a person's name used as a row label in a list — not a primary display context like a character sheet. Use `--fl` 700 (Lato bold), not Cinzel. Cinzel is reserved for the character sheet name display.
- **Badge taxonomy**: `.proc-row-status`, `.dt-resolve-badge`, `.dt-status-badge`, `.dt-proj-done-badge`, `.dt-proj-pending-badge` — all dense list badges: Lato 9px 900 uppercase `border-radius:3px` `padding:2px 6px`.
- **Ambience chip** (`.proc-amb-pending-chip`, `.dt-matrix-amb`): These are status chips → `--fl` 600 small-caps (or uppercase if ≤10px).
- **Feeding Matrix cell labels**: Table labels and cell text → `--fl` for labels, `--ft` for any prose description content.
- **Parchment `accent-color`** (rote checkbox): Stays as `accent-color: var(--crim)` in parchment override — not replaced by token because `accent-color` takes a colour value, not a CSS variable reference that maps to a parchment token. Actually `var(--accent)` is now defined and resolves to `var(--crim)` on parchment — use `accent-color: var(--accent)` and move it out of the override block.

## Files to Change

- `public/css/admin-layout.css` (Downtime section selectors only)

## Acceptance Criteria

- [ ] No Downtime-tab selector uses `var(--fhd)` or `var(--fb)`
- [ ] `.roll-count` and `.roll-title` use `--fl` — not Cinzel
- [ ] All five dense badge classes share a comma-grouped base rule: Lato 9px 900 uppercase radius:3px padding:2px 6px; colour overrides per-class
- [ ] Processing validation button active states (`.proc-val-status button.active.pending/validated`) use `--result-pend`/`--result-succ` tokens
- [ ] Ambience indicators (`.proc-amb-pos`/`.proc-amb-neg`) use `--result-succ`/`--result-pend` tokens — not hardcoded colours
- [ ] `accent-color` on rote checkbox uses `var(--accent)` and does not require a parchment override
- [ ] Hover/focus state colours on proc buttons and inputs use `var(--accent)`
- [ ] Feeding matrix table cell labels use `--fl`; any prose content uses `--ft`
- [ ] No visual regressions in Downtime tab (both themes)

## Tasks / Subtasks

- [ ] **Font sweep** — replace `--fhd`/`--fb` in Downtime selectors
- [ ] **Cinzel → Lato**: All proc labels, section titles, status texts, roll modal text, feeding matrix labels
- [ ] **Badge consolidation**: Comma-group `.proc-row-status`, `.dt-resolve-badge`, `.dt-status-badge`, `.dt-proj-done-badge`, `.dt-proj-pending-badge` into shared base rule; per-class colour overrides only
- [ ] **Colour sweep**: `var(--gold2)` → `var(--accent)` in Downtime selectors
- [ ] **Colour sweep**: Hardcoded greens → `--result-succ`/`--green-dk` variants; reds → `--result-pend`; ambers → `--warn-dk`
- [ ] **Colour sweep**: `rgba(224,196,122,...)` → `--accent-a8`/`--accent-a25`/`--accent-a40`
- [ ] **`accent-color`**: Move rote checkbox to `accent-color: var(--accent)` and remove from parchment override block
- [ ] **Parchment override block**: Delete Downtime rules made redundant; keep only rules that cannot be tokenised

## Dev Notes

- The parchment override block in `admin-layout.css` (lines ~4754+) has Downtime-specific rules mixed with other tab rules. Only delete rules clearly owned by Downtime selectors (`proc-*`, `dt-*`, `roll-*`, feeding/ambience selectors).
- `.dt-scene-mod`, `.dt-matrix-amb`, `.dt-matrix-nosub-badge`, `.dt-chk-nosub-badge` have a parchment font-size floor of 12px. After the sweep, if these are now `--fl` at a defined size, the floor is redundant — remove it.
- Reference panels 16-20 in `public/test layout/font-test.html` as the visual spec throughout.
