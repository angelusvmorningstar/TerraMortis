# Epic CMB Retrospective — 2026-09-01

Run immediately after Epic CMB's `bmad-epic-loop` closed (branch `ms/epic-cmb-combat-panel`, commit
`64372950`). First retrospective run in this project — no prior one exists to cross-reference for
continuity.

Format note: `bmad-retrospective`'s own skill script is written for a generic multi-agent BMAD
install (a scripted fictional dev-team cast, `_bmad/bmm/config.yaml`, PRD/architecture planning
documents) that doesn't exist in this repo. This retrospective keeps the skill's actual intent —
blameless, systems-focused, concrete examples, two-part epic-review-then-next-steps — without the
fictional roleplay, since the real participants were the orchestrator (this session), five Opus
dev-story subagents, and Angelus.

## What went well

1. **The mockup-and-party-mode phase paid for itself.** Every design ambiguity that could have
   stalled a dev-story mid-flight — collapse/expand behaviour, touch-target sizing, the damage-split
   display convention, the "rails not handcuffs" pattern — was resolved before any production code
   was written. None of the five stories hit a genuine design fork during implementation; every
   "how should this look/behave" question had already been answered by the time `cmb.1` started.
2. **Independent re-verification caught something real, not just theatre.** It caught the
   `rolledInitiative` field-name error described below, forced seven real screenshots across three
   stories rather than accepting green DOM assertions as proof the UI looks right, and independently
   confirmed `cmb.3a`'s Errata-vs-RAW formula corrections by hand arithmetic rather than trusting the
   subagent's own claimed verification.
3. **Live pre-flight checks turned assumptions into facts quickly.** The direct Mongo query against
   `tm_game.equipment_catalogue` (run in minutes) definitively closed a completeness risk Dana's
   earlier scoping round could only flag as "needs verification," and incidentally surfaced two real
   scope-narrowers (no live Thrown example, no aerodynamic field) that shaped `cmb.3b`'s own spec.
4. **Risk-gate discipline held under real pressure to keep moving.** Two genuine product/architecture
   calls (scene persistence staying sessionStorage-only; the Errata being authoritative over core RAW)
   each got a real question to Angelus rather than a default guess, and both resolved in a single
   exchange without stalling the loop's own momentum.
5. **Subagents disclosed rather than smoothed over their own judgment calls.** Three separate
   implementers flagged real side effects or interpretive decisions unprompted: `cmb.3a`'s roll-label
   change altering `rlv.7`'s mod-chip persistence keying; `cmb.3b`'s choice to key weapon identity by
   array index rather than `catalogue_id`; `cmb.3c`'s discovery that its own Apply button is the first
   caller in the file's history to send a damage delta greater than 1, exposing a pre-existing
   `tracker.js` gap. None of these were hidden or silently decided.

## What was friction, not failure

1. **The orchestrator's own error, made twice before being caught.** `rolledInitiative` was invented
   as a field name in both `cmb.1`'s and `cmb.2`'s story specs before it was checked against the real
   file — the actual field is `cb.initiative`. `cmb.2`'s implementer caught it and built against the
   real field rather than compounding the mistake; the review process then documented it plainly
   rather than letting it stay ambiguous in the record. A grep before writing any spec sentence that
   claims "the real field is X" would have prevented this at the source, not just caught it downstream.
2. **One story spec authored a genuine internal inconsistency.** `cmb.3a`'s AC2 cross-referenced AC7
   for an ordering rule AC7 never actually stated. The implementer resolved it sensibly and flagged the
   inconsistency rather than guessing silently, but writing five fairly dense specs in one sitting
   risks exactly this kind of small cross-reference drifting out of sync with itself.
3. **Playwright runtime scaled with the epic, not just the codebase.** The independently-run
   regression grew 23 → 59 → 93 → 123 tests across the four review passes, and foreground test runs
   started timing out by the third story's review. Backgrounding the run solved it mechanically, but
   it's worth naming: the review cost of "re-run the whole epic's suite every story" grows the same
   way the feature surface does, and a longer epic would need this planned for rather than discovered.
4. **The real app boot path is still unverified.** Every check in this epic went through an isolated
   `initCombatTab()`-against-a-synthetic-host harness with stubbed API routes — a deliberate,
   correct choice given this project's own standing caution about hitting live data locally, but it
   means "does this mount cleanly inside the actual live Game App, through its real nav and real API"
   is still a first check that hasn't happened yet.

## Readiness assessment

Code-complete, reviewed story by story and at epic close, committed locally to
`ms/epic-cmb-combat-panel`. **Not deployed, not merged to main/dev, not smoke-tested in the real
running app.** This is the correct state given the hard rule against merging/pushing without explicit
instruction — not a gap the epic-loop itself left open.

## Next-epic / follow-up candidates

- **Epic CERR** (proposed, not started) — the Errata's rewritten contested-overpower grapple, Tilts
  (Immobilised/Knocked Down/Stunned), reflexive off-turn blood-spend healing, and Errata-specific
  items. Genuinely unscoped beyond Epic CMB's own Decision 4 (these are new stateful concepts, not
  number corrections — a materially different, larger kind of story than anything in CMB).
- Two small, standalone, pick-up-anytime items already logged in `specs/stories/deferred-work.md`,
  neither warranting their own epic: `rlv.7`'s mod-chip persistence keying change (a product
  question, not an engineering one), and `tracker.js`'s damage-delta headroom clamp (an engineering
  fix, narrow blast radius).
- Before Epic CMB ever reaches players: a real smoke test on a deployed environment (Netlify/Render),
  since Angelus cannot verify this locally and nothing in this epic's own review substitutes for that.

## Action items

| Item | Owner | Note |
|---|---|---|
| Grep any field/function name before writing it into a story spec's "Decisions" or "Dev Notes" section, not just when reviewing a subagent's use of it | orchestrator (this session's own practice) | Directly caused by finding #1 above |
| Add a self-review pass across a batch of same-epic specs before delegating, checking cross-references between ACs actually hold | orchestrator | Directly caused by finding #2 above |
| Decide whether to merge `ms/epic-cmb-combat-panel` to `main`/`dev` and push | Angelus | Explicit instruction required either way per this repo's hard rules |
| Real device/live-app smoke test of the Combat tab once deployed | Angelus | The one verification class this epic-loop structurally could not perform itself |
| Scope Epic CERR, if/when wanted | Angelus + a future party-mode round | Not started, not urgent |
