---
id: cmb.3a
epic: cmb
epic_file: specs/epic-cmb-combat-panel.md
status: done
priority: high
type: feature
depends_on: [cmb.1]
branch: ms/epic-cmb-combat-panel
---

# Story CMB.3a: Attack modal shell — target, type, adjustable pool (Errata-correct)

## Story

As the ST resolving an attack,
I want to pick a target and an attack type and get a correctly-computed dice pool that I can still
freely adjust before rolling,
so that I never have to look up a formula mid-scene, but I'm never locked out of a roll the rules
don't cleanly cover either.

## Why this story exists

Today's per-character preset pool buttons (`_attackPools`/`cbt-pool-btn`/`combatQuickRoll`) hard-code
one or two pools per character at scene-setup time and can't represent "attack this specific target,
with this specific type, at this specific moment." This story replaces that entirely with the
validated mockup's Attack modal: tap Attack, pick a target, pick a type, get a preloaded pool you can
still nudge with `+`/`-`, or bypass every preset with "Other." This is the epic's clearest test of
"support rails, not handcuffs" and — per Angelus's own ruling this session — the epic's highest
fingertip-risk surface, since it's genuinely new UI, not a re-skin.

**Angelus's ruling, this session (do not re-derive): where Terra Mortis's own Conflict Errata
disagrees with core VtR 2e RAW, the Errata is authoritative.** This story's pool formulas are built
to the Errata, not the core rulebook, in two places that actually differ (below).

## Decisions already made (do not re-litigate)

- **The five attack types, Errata-corrected:**
  - Unarmed Combat: Strength + Brawl − Defence
  - Melee Combat: Strength + Weaponry − Defence
  - Ranged Combat: Dexterity + Firearms (never subtracts Defence — the rulebook's own rule, p.176:
    "You cannot apply your character's Defense against firearms attacks." This is not overridden by
    the Errata, so it stands as-is)
  - Thrown Weapons: **Strength + Athletics − Defence** — this is the Errata's own formula and differs
    from core RAW's Dexterity + Athletics. Use Strength. The Errata's further note that an
    *aerodynamic* thrown weapon may use Dexterity or Strength at the player's discretion is a
    per-weapon property this story has no weapon data to evaluate yet — out of scope here, `cmb.3b`'s
    problem once real weapons are wired in.
  - Other: a fully custom pool starting at 0 (or the last value used this session, ST's choice which
    is simpler to build), no formula, no preset.
- **"Other" is not a fallback or a lesser option.** Same visual weight, same one-tap reachability as
  every formula-backed type, every time (Epic CMB Decision 5). A pool that can't be freely adjusted,
  or a Roll action gated on a selection existing, fails review on sight regardless of which type is
  selected.
- **When Ranged Combat is selected, the target's Defence reads as not applicable, not just "not
  subtracted."** The pool math already doesn't touch it, but the target-picker's own Defence chip
  should visibly reflect that firearms bypass it entirely (e.g. greyed/labelled), so the ST isn't left
  wondering why a visibly-nonzero Defence number did nothing.
- **This story replaces, not supplements, today's preset pool buttons.** `_attackPools`,
  `window.combatQuickRoll`, and the `cbt-pool-btn` markup are retired as part of this story — the new
  "Attack" button opens this modal instead. `server/tests/rlv-1-combat-tab-quick-roll.test.js`
  specifically asserts `window.combatQuickRoll` exists and behaves a certain way; once that function
  is gone, this test's subject no longer exists. Delete it rather than leave it red, following this
  repo's own established precedent for a deliberately-retired module (see `crd-2-player-facing-
  pending-queue`'s Dev Agent Record: `challenge-notification.js DELETED... this project's unbroken
  precedent for superseded client modules, checked against `git log --diff-filter=D``). Confirm via
  the same check before deleting — make sure nothing else in the live app still calls
  `combatQuickRoll`.
- **Pool math uses the real effective-value accessors, not the file's own local shortcut.**
  `combat-tab.js` currently defines a private `skDots(c, skill)` helper reading only
  `c.skills?.[skill]?.dots`, silently ignoring skill bonus dots (from merits, etc.) — a real,
  pre-existing accuracy gap in the preset-pool system this story is retiring anyway. The real,
  bonus-inclusive accessor `skTotal(c, skill)` already exists and is exported from
  `public/js/data/accessors.js` (confirmed: `skTotal = min(dots + bonus + PT/MCI bonus dots, 5)`).
  Since this story is writing fresh pool-computation code from scratch, use `skTotal` and
  `getAttrEffective` (already imported) for every attribute/skill this modal reads — don't carry the
  local shortcut forward into new code.
- **The pool preview updates live as target/type change**, matching the validated mockup, and the
  stepper's current value is what actually gets used when Roll is pressed — never silently
  recalculated out from under a manual adjustment.

## Acceptance Criteria

1. An "Attack" button replaces the existing per-character pool buttons on the expanded card
   (`cmb.1`'s `.cbt-pool-row`). Tapping it opens a modal.
2. The modal's Target section lists every other combatant currently in the scene as a tappable pill,
   each showing their Defence — struck through or otherwise visually marked if `defenceUsed` is
   already true for that combatant, and marked not-applicable specifically when Ranged Combat is the
   selected type (AC7 below covers the ordering of these two states).
3. The modal's Attack Type section lists Unarmed / Melee / Ranged / Thrown / Other. Selecting a type
   computes and previews a pool using the Errata-corrected formulas above, against the current
   attacker and (if selected) target.
4. The computed pool is shown next to a `+`/`-` stepper that can move it to any non-negative integer,
   including down to 0 — for every type, including the preset ones. This is tested explicitly per
   type, not asserted once and assumed to generalise.
5. "Other" starts the stepper at 0 with no formula shown, is always visible and tappable regardless of
   what else is selected, and the Roll action works identically from it as from any preset type.
6. Selecting Ranged Combat never subtracts the target's Defence from the pool (even if a target with a
   large Defence is selected), and the target's Defence chip visibly indicates it doesn't apply for
   this type.
7. Changing the target or the type after a pool is already showing recomputes the preview from the
   current selections — but if the ST has manually adjusted the stepper, changing target/type again
   is allowed to reset to a fresh formula-computed value (this is a preview recompute, not a
   protected manual override) — document whichever behaviour is actually built here, since the story
   doesn't mandate one specific interaction over the other, only that manual adjustment is never
   blocked once a type is settled and the modal is about to be submitted.
8. Pressing Roll with a type selected always works (does not require a target — some attack
   narratively might not need one tracked, though picking one is expected in normal play); pressing
   Roll with no type selected is the only case that can be disabled/blocked.
9. `window.combatQuickRoll`, `_attackPools`, and the old `cbt-pool-btn` rendering are removed.
   `server/tests/rlv-1-combat-tab-quick-roll.test.js` is deleted (its subject no longer exists),
   confirmed via a repo-wide search that nothing else references `combatQuickRoll` before deleting.
10. Every new interactive control in the modal (target pills, type rows, the stepper buttons, Roll,
    Cancel/close) meets the same real ≥44×44px AC established in `cmb.1`/`cmb.2`.
11. The modal opens and closes cleanly from a real tap sequence in a real browser (Playwright,
    Pointer/click events) — this is the epic's highest fingertip-risk surface per Angelus's own
    framing, so this story's test coverage is judged specifically on whether it proves real touch
    usability, not just DOM presence.

## What this story is NOT

- Not equipped-weapon awareness (`cmb.3b`) — no weapon chips, no per-weapon damage rating, the
  aerodynamic Dexterity-or-Strength choice for Thrown weapons does not apply here since there's no
  weapon data yet.
- Not the Kindred damage-split arithmetic (`cmb.3c`) — Roll hands off to the existing Roll tab
  (`loadPool`/`goTab('roll')`, matching the retiring `quickRoll`'s own pattern) or an equivalent
  confirmation; damage entry itself is unchanged from `cmb.1`'s existing +B/+L/+A/− controls.
- Not a change to the Grapple/Dodge/Tilts rules from the Errata — explicitly out of Epic CMB's scope
  per its own Decision 4.

## Tasks / Subtasks

1. Remove `_attackPools`, its call site in `_combatantFromChar`, `window.combatQuickRoll`, and
   `.cbt-pool-row`/`.cbt-pool-btn` rendering and CSS. Confirm via repo-wide search no other live code
   references `combatQuickRoll` before deleting `rlv-1-combat-tab-quick-roll.test.js`.
2. Import `skTotal` from `public/js/data/accessors.js` alongside the already-imported
   `getAttrEffective`/`calcDefence`/etc.
3. Build the modal's DOM (target pills, type rows with formula preview, pool stepper, Roll/Cancel) as
   a new element appended outside `.cbt-wrap` (matching how a real modal overlay needs to sit above
   the whole tab, not nested inside the scrollable card list) — reuse `esc()` for every interpolated
   value per this file's existing convention.
4. Wire the five formula functions per the Decisions section above, each reading `getAttrEffective`/
   `skTotal` against the attacker and (where relevant) the selected target's `defence`/`defenceUsed`.
5. Wire the stepper, Roll, and Cancel/close handlers. Roll hands the final pool + a label (attacker,
   type, target if any) to the existing `loadPool`/`goTab('roll')` path, matching `quickRoll`'s
   current behaviour as closely as the new shape allows.
6. Add the new CSS (modal overlay, target pills, type rows, stepper) to `suite.css`, tokens only, with
   every control sized to `--tap-min` from the start (no retrofit pass needed the way `cmb.1` had to
   do for pre-existing controls).
7. Write Playwright coverage for AC1-AC11, following the established house style in
   `tests/cmb-1-combat-card-touch-targets.spec.js`/`tests/cmb-2-drag-reorder.spec.js` (real dispatched
   events, real measured boxes, stubbed API, service workers blocked).

## Dev Notes

- Real files touched: `public/js/game/combat-tab.js`, `public/css/suite.css`. Real file deleted:
  `server/tests/rlv-1-combat-tab-quick-roll.test.js` (confirm-then-delete per Task 1).
- `cb.defence` and `cb.defenceUsed` already exist on every combatant (unchanged since before `cmb.1`)
  — the target picker reads these directly, no new fields needed for Defence display.
- Rulebook citation for "Defense never applies against firearms": `st-working/reference/Vampire the
  Requiem 2e Rulebook.md`, the Defense section, p.176 (this session's own earlier direct read).
  Errata citation for the Thrown/damage-split rules: the Conflict Errata Google Doc (this session's
  own earlier direct read, not re-fetched for this story — the two specific numbers this story needs
  are recorded verbatim in the Decisions section above and in `specs/epic-cmb-combat-panel.md`).
- Angelus cannot smoke-test locally. This story's own touch-target and gesture ACs (10, 11) need real
  browser verification in the Dev Agent Record, not a claim.

## Dev Agent Record

Implemented by an Opus subagent (bmad-epic-loop Phase 2), 2026-09-01. `_attackPools`, the local
`skDots` shortcut, `quickRoll`, and `window.combatQuickRoll` all removed; `_combatantFromChar` no
longer computes preset pools at park time. New Attack modal module: `ATTACK_TYPES` (the five
Errata-corrected formulas), `_atkPoolFor`/`_atkFormulaText`/`_atkTypeDesc` (pool maths and live
formula preview using `getAttrEffective`/`skTotal`, never the retired local shortcut), a full
open/close/target/type/step/roll lifecycle (`_atkOpen`/`_atkClose`/`_atkSetTarget`/`_atkSetType`/
`_atkStep`/`_atkRoll`), and seven new `window.combatAttack*` functions. The modal is parented to
`document.body`, not to the tab's own `_el` (which `render()` replaces wholesale and which is itself
an `overflow:hidden` scrolling column the modal has to sit above). `quickRoll` survives internally as
`_rollPool` — same `loadPool(pool, label, {total: pool})` + `goTab('roll')` hand-off, unchanged
contract, new caller.

**`combatQuickRoll` reference search, before deletion (Task 1):** live app code only references it
inside `combat-tab.js` itself. `roll-v2.js` and `tests/rlv-7-persistent-mod-chips.spec.js` mention
`quickRoll` in comments only (rlv-7 calls `window.loadPool` directly). Two live **test**
references the story text didn't anticipate: `server/tests/rlv-1-combat-tab-quick-roll.test.js`
(deleted, per AC9 — its subject no longer exists) and `server/tests/cmb-1-combat-card-shell.test.js`,
which asserted the old preset buttons directly and would have failed to import at all (its
`accessors.js` mock lacked `skTotal`). That suite was updated, not deleted: `skTotal` added to the
mock, the preset-button assertion repointed at the Attack button, and cmb.1's own Task 8 guard
rewritten to assert the same `loadPool`+`goTab` contract through the new front door plus
`window.combatQuickRoll` being genuinely `undefined`.

**AC7's acknowledged ambiguity, resolved:** changing target or type recomputes the pool from the
formula and discards a prior manual adjustment, rather than preserving the delta. Reasoning: a manual
adjustment is made in a specific context (a called shot, cover, a house-rule nudge) that doesn't
necessarily still apply once the target or type changes underneath it — carrying the raw number
forward would silently misrepresent it as belonging to the new selection. The stepper stays live
immediately after any recompute, and `_atk.pool` (whatever it currently reads) is always what Roll
actually uses, so the ST is never blocked from re-adjusting.

**AC2's own text was internally inconsistent** ("AC7 below covers the ordering" of the Defence-used
strike-through vs. the Ranged not-applicable marking — AC7 is actually about recompute-on-change and
says nothing about this). Resolved directly in code: Ranged's "N/A" marking wins over the
defence-used strike-through, since firearms bypass Defence regardless of whether it's been spent, and
showing both markings at once on the same pill reads as noise rather than information.

New test: `tests/cmb-3a-attack-modal.spec.js` (36 tests, AC1-AC11). Fixture numbers are deliberately
chosen so a wrong implementation gives a different answer rather than an accidentally-matching one:
Wan's Strength (4) and Dexterity (3) differ specifically so a Thrown pool built on the wrong attribute
is a different number, not the same one by coincidence, and Wan's Brawl carries a bonus dot
specifically so `skTotal`'s inclusion of it is provable rather than assumed. The two Errata-vs-RAW
corrections (Thrown's attribute, Ranged's Defence exemption) are each asserted with an explicit
negative control, not just a positive value check.

One real behavioural side effect on a different, already-shipped feature, flagged honestly rather
than hidden: Roll's label now includes the target name (`"Unarmed Combat vs Reed"`), which is also
`loadPool`'s `POOL_NAME` — the key `power-mod-chips.js` (rlv.7's persistent modifier chips) partitions
storage on. This makes chip persistence per-target rather than per-skill for combat rolls specifically.
Logged to `deferred-work.md`, not treated as a defect against this story's own ACs.

## Senior Developer Review

**Independently re-verified, not trusted on the subagent's report alone** (bmad-epic-loop Phase 3,
orchestrator inline, 2026-09-01):
- Re-ran every claimed suite myself: `cmb-1-combat-card-shell.test.js` + `gdx-4-css-standards-grep
  .test.js` + `issue-879-defence-penalty-wirein.test.js` — 131/131. `cmb-1-combat-card-touch-targets
  .spec.js` + `cmb-2-drag-reorder.spec.js` + `cmb-3a-attack-modal.spec.js` — 59/59.
- Read the full current `combat-tab.js` directly, not a diff summary. Confirmed `_attackPools`,
  `combatQuickRoll`, `skDots`, and `.cbt-pool-btn` are genuinely absent (AC9) — not just asserted by a
  test, independently grepped and read. Confirmed the five `ATTACK_TYPES` formulas match the story's
  own Decisions section exactly, including both Errata corrections. Confirmed `_atkPoolFor` clamps at
  0 and never subtracts Defence for Ranged regardless of target. Confirmed `removeCombatant`'s
  handling of the attacker/target being removed mid-attack (closes the modal or clears the target
  respectively) — a real edge case the story's own ACs didn't name, handled correctly anyway.
- Traced the flagged mod-chip side effect to ground rather than taking the subagent's word for it:
  read `power-mod-chips.js` directly, confirmed its storage key is genuinely `(charId, POOL_NAME)`
  and that the new target-inclusive label changes that partitioning. Logged to `deferred-work.md` as
  a real, non-blocking, informational finding — Angelus's own call, not a defect to fix here.
- Read `tests/cmb-3a-attack-modal.spec.js` in full. Confirmed the fixture design genuinely
  discriminates a correct implementation from a RAW-from-memory or bonus-dot-dropping one (Strength ≠
  Dexterity, Brawl carries a bonus dot, explicit `.not.toBe()` negative controls on both Errata
  corrections) rather than merely exercising the code path.
- **Visually verified directly**: a throwaway Playwright harness opened the modal at a real phone
  viewport, selected Reed as a target and Melee Combat as the type (confirmed the live formula text
  "Strength 4 + Weaponry 1 − Defence 4" and a pool of 1d, matching hand arithmetic exactly), then
  switched to Ranged Combat and confirmed Reed's Defence chip read "DEF 4" struck through with "N/A"
  appended and the pool correctly read 6d (Dexterity 3 + Firearms 3, no subtraction) — then deleted the
  harness and its screenshots per this repo's own convention.

**Three-lens findings, triaged:**
- **(Low, informational, logged to `deferred-work.md`, not patched)** The mod-chip persistence
  granularity change described above. Real, deliberate (not a bug), affects a different shipped
  feature, needs Angelus's read rather than an engineering fix.
- No High or unresolved Medium findings against this story's own Acceptance Criteria. AC1-AC11 all
  independently confirmed — several (AC9's "genuinely gone," AC3's Errata-correct formulas) by direct
  code reading, not test-trust alone.

**Verdict: done.** The epic's highest-risk story is the one that got the most scrutiny; nothing found
that changes the outcome.

## Change Log

- 2026-09-01: Story created (bmad-epic-loop, Phase 1), ready-for-dev.
- 2026-09-01: Dev-story complete (Phase 2, Opus subagent). Preset pool system fully retired,
  Errata-corrected Attack modal built, one pre-existing story-text inconsistency (AC2/AC7) resolved
  directly, one real side effect on rlv.7's mod-chip persistence flagged honestly.
- 2026-09-01: Independently re-verified + 3-lens reviewed (Phase 3, orchestrator inline). One Low
  informational finding logged to `deferred-work.md`. Status → done.
