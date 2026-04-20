# Story EPC.3: Surface Auspex Insight Questions in Game App

Status: ready-for-dev

## Story

**As an** ST running an Auspex scene during a live game,
**I want** the relevant Insight questions to appear when Auspex is selected in the dice roller,
**so that** I can prompt the player with the right questions without checking a separate document.

## Background

`public/js/data/auspex-insight.js` exports `AUSPEX_QUESTIONS` — an object with tier-based questions (Tier 1–3, cumulative by Auspex dot rating). The data exists but has no surface in the game app.

When a character with Auspex is selected in the dice roller and Auspex is chosen as the discipline, the questions available at that character's Auspex rating should appear below the roll controls.

## Acceptance Criteria

1. When Auspex is selected as a discipline in the game app dice roller, a question panel appears below the pool display.
2. Questions shown are cumulative up to the character's Auspex dot rating (e.g. dots 1–2 shows Tier 1 questions, dots 3–4 adds Tier 2, dot 5 adds Tier 3).
3. If the character has no Auspex, the panel is not shown.
4. Questions are read-only reference — no interaction required.
5. Panel uses design system tokens — `.panel`, `--surf2`, `--txt2`, `--label-secondary`.

## Tasks / Subtasks

- [ ] Import `AUSPEX_QUESTIONS` from `data/auspex-insight.js` in dice-engine.js (or the suite dice module)
- [ ] After discipline is selected, check if `discName === 'Auspex'`
- [ ] If so, get the character's Auspex dots and render cumulative questions for all tiers up to that rating
- [ ] Render as a collapsible panel below the pool display with a "Auspex Insight Questions" header
- [ ] Use `.panel`, `--label-secondary` for labels, `--txt2` for question text — no new CSS needed

## Dev Notes

- `public/js/data/auspex-insight.js` — `AUSPEX_QUESTIONS` keyed by tier (1, 2, 3), each an array of question strings
- Auspex dots: `c.disciplines?.Auspex?.dots || 0`
- Tier thresholds: Tier 1 = dots ≥ 1, Tier 2 = dots ≥ 3, Tier 3 = dots ≥ 5 (verify against AUSPEX_QUESTIONS structure)
- This renders inside the dice roller after discipline selection — add to `dice-engine.js` render function

## Dev Agent Record
### Agent Model Used
### Debug Log References
### Completion Notes List
### File List
