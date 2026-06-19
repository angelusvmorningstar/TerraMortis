# Session handover → Peter (2026-06-18)

**#886 implemented and shipped (dev + main, production deployed, issue closed).**
Angelus is backing off `dev` again — the floor is yours.

DT Story tab now shows read-only **resolved outcomes** for Feeding + Projects
(sourced from DT Processing: `rev.outcome` / `player_facing_note`) instead of the
old re-authoring layer. `compilePushOutcome`, completion-gating, and the progress
chips were repointed to the resolved outcome. **Home Report removed** (superseded by
Territory Pulse). Story Moment / Rumours / Allies & Asset Summary unchanged.

Two things for you:
- **Playwright needs a real run** — I couldn't run it locally. Updated `fix.398` and
  `fix-814` AC4 for the removals; please confirm the DT-story set goes green.
- **Cutover:** any cycle mid-processing with old drafts but no `rev.outcome` will
  publish gap-text for those sections until the outcome is written in Processing.

Full detail: `specs/stories/feat.886.dt-story-resolved-outcomes.story.md`. The
dev→main promotion also carried your ECM epic (#868–#876) to production (clean merge).
