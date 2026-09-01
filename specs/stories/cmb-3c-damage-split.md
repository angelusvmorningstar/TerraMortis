---
id: cmb.3c
epic: cmb
epic_file: specs/epic-cmb-combat-panel.md
status: done
priority: high
type: feature
depends_on: [cmb.1]
branch: ms/epic-cmb-combat-panel
---

# Story CMB.3c: Kindred damage-split arithmetic

## Story

As the ST applying damage after a roll,
I want the Lethal/Bashing split the Errata actually specifies computed for me from the successes and
the weapon's rating,
so that I don't have to do that maths by hand every single hit, but the raw damage buttons are still
right there if I'd rather just enter it myself.

## Why this story exists

`cmb.1`'s damage controls (+B/+L/+A/−) are correct and stay exactly as they are — this story adds a
small calculator beside them that pre-fills those same buttons with the Errata's own split, rather
than asking the ST to work it out during a live scene. This is the last of the epic's three "make the
prototype's math actually correct" stories (Decision 1: Errata beats RAW), and the clearest
application yet of Decision 2 (show the arithmetic, land it in the existing editable fields, never a
silent auto-apply).

## The exact formula (re-derive nothing — this is quoted, not summarised)

Terra Mortis Conflict Errata, Combat → Damage: *"By default, all damage dealt to Kindred is Bashing.
Where an ability or power would apply Lethal or Aggravated damage, only the Weapon Rating is
upgraded. Thus, a 1L weapon used with Kindred duelling would deliver one Lethal damage + successes
Bashing damage. In the case of a 0L weapon, the first success is upgraded to Lethal, with subsequent
successes adding Bashing damage."*

Read against the core rulebook's own damage rule (p.176: *"Determine damage by adding the successes
rolled to any weapon bonus"* — total damage is successes **plus** the weapon's rating, not the rating
subtracted from or capped by successes), the arithmetic is:

- **Rating > 0:** the rating is delivered as its own damage type (Lethal, or Aggravated for a
  power/ability that grants that), and **every rolled success is Bashing** on top of it. Total damage
  = rating + successes. (*"a 1L weapon... one Lethal + successes Bashing."*)
- **Rating = 0** (a 0-rated weapon, or no weapon/power rating at all — bare successes only): no extra
  point is added, but **the first success itself is upgraded** to the relevant type (Lethal by
  default), and every success after the first is Bashing. Total damage stays exactly the successes
  rolled. (*"a 0L weapon... first success is upgraded... subsequent successes adding Bashing."*)
- Zero successes with a positive rating still delivers the rating alone (an ST calling this up for a
  narrative/guaranteed effect, not a normal miss) — the calculator computes whatever is entered, it
  does not gate on "was this actually a hit."

## Decisions already made (do not re-litigate)

- **This is a self-contained calculator, not wired to the Attack modal's own state.** The ST enters
  Successes and Rating by hand — this story does not thread the weapon selected in `cmb.3a`/`3b`
  through to here. Reasoning: the roll itself happens on a different tab entirely (`_rollPool` hands
  off to `loadPool`/`goTab('roll')`), so by the time damage is being entered the ST is back on the
  Combat tab looking at a result they saw somewhere else — asking them to type the two numbers they
  already know (successes rolled, and the rating of whatever they used) is simpler and more robust
  than trying to carry state across a tab switch. A future story could wire this up automatically;
  explicitly out of scope here.
- **The calculator lives on each card, beside the existing damage controls, and applies to that
  card's own health track.** No new per-scene state — it operates on the same combatant the +B/+L/+A
  buttons already belong to.
- **The output is a worked, both-audiences explanation, landing directly in the existing +L/+B
  fields, per Decision 2:** e.g. *"5 successes, rating 1 → 1 Lethal (a mortal takes this too) + 5
  Bashing to Kindred (a mortal would take these as Lethal too)."* Not a dismissible chip, not a
  silent auto-apply — a preview that Apply commits into the same `applyDmg`/`trackerAdj` path the
  manual buttons already use, as if the ST had clicked `+L`/`+B` that many times themselves.
- **Rating's damage type defaults to Lethal, with an explicit toggle for Aggravated** (the Errata's
  own text names both as things "an ability or power would apply"). Aggravated is genuinely rarer in
  play — default to Lethal, let the ST switch it.
- **Applying the split is additive to whatever damage already exists on the card**, exactly like
  clicking `+L`/`+B` individually already is — it does not reset or overwrite existing marked
  damage.

## Acceptance Criteria

1. Each expanded card's damage section gains a small calculator: a Successes stepper/input, a Rating
   stepper/input, a Lethal/Aggravated toggle for the rating's type (defaulting Lethal), and a live
   preview of the computed split using the exact both-audiences phrasing above.
2. Rating > 0: preview shows `rating` points at the selected type and `successes` points as Bashing —
   tested with at least one case where this is directly checkable by hand (e.g. successes=5,
   rating=1 → "1 Lethal + 5 Bashing").
3. Rating = 0: preview shows exactly 1 point at the selected type (only when successes ≥ 1;
   successes=0 shows nothing to apply) and `successes − 1` points as Bashing — tested with
   successes=1 (→ 1 Lethal + 0 Bashing) and successes=5 (→ 1 Lethal + 4 Bashing) as two distinct
   cases, since off-by-one here is the likeliest real bug.
4. Toggling Aggravated instead of Lethal changes only the labelled type in the preview and which
   damage field Apply writes to (`aggravated` instead of `lethal`) — the split arithmetic itself is
   identical either way.
5. Pressing Apply commits the previewed split via the same `combatDmg`/`applyDmg` path the existing
   +B/+L/+A buttons already use — additively, not as a reset — verified by pre-damaging a card, then
   applying a split, and confirming both the pre-existing damage and the new split are present
   afterward.
6. The raw +B/+L/+A/− buttons from `cmb.1` are completely unchanged and still independently usable —
   this calculator is an addition beside them, never a replacement, and using it is never required to
   enter damage (Epic CMB Decision 5, restated once more because every story in this epic has to keep
   proving it).
7. The calculator's own inputs never block or gate anything else on the card — collapsing/expanding,
   the drag handle, the Attack button, and the raw damage buttons all keep working exactly as before
   regardless of what's currently typed into the calculator.
8. Every new interactive control (the two steppers, the type toggle, Apply) meets the same real
   ≥44×44px AC established throughout this epic.

## What this story is NOT

- Not automatic weapon-rating carry-over from the Attack modal — see Decisions above.
- Not a change to how rolling itself works, or to `_rollPool`/`loadPool`/`goTab('roll')`.
- Not the Errata's other subsystems (grapple, Tilts, reflexive healing) — those remain out of Epic
  CMB entirely per its own Decision 4.
- Not a hit/miss gate — the calculator computes whatever is typed in, the ST decides whether and when
  to use it.

## Tasks / Subtasks

1. Add the split-calculation function (pure, no side effects) implementing the exact formula above,
   with its own focused unit-style test cases covering both the rating>0 and rating=0 branches and
   the off-by-one boundary at successes=1.
2. Add the calculator's markup to `_cardBodyHtml`, beside the existing `.cbt-dmg-ctrl` block, using
   the same `--tap-min`-sized control conventions this epic has used throughout.
3. Wire Successes/Rating steppers and the Lethal/Aggravated toggle to local per-card state (does not
   need to persist to `sessionStorage` — it's a scratch calculator, not part of the combat scene's
   own durable state).
4. Wire Apply to call the existing `combatDmg`/`applyDmg` function for both halves of the split.
5. Write Playwright coverage for AC1-AC8, following this epic's established house style (real
   dispatched events, real measured boxes, hand-checkable arithmetic in the fixture design).

## Dev Notes

- Real file touched: `public/js/game/combat-tab.js` (the `_cardBodyHtml` function and a new pure
  calculation helper), `public/css/suite.css` (the calculator's own small block of rules).
- No server-side changes, no schema changes, no new `sessionStorage` fields.
- This closes out Epic CMB. Once this story is reviewed and `done`, the whole epic is ready for its
  close-out commit (see the epic's own bmad-epic-loop run notes) — nothing else is scoped after this.

## Dev Agent Record

Implemented by an Opus subagent (bmad-epic-loop Phase 2), 2026-09-01. New exported pure
`computeKindredSplit(successes, rating)` implements the formula exactly: `rating > 0` returns
`{ ratedPoints: rating, bashingPoints: successes }`; `rating === 0` returns `{ ratedPoints: successes
>= 1 ? 1 : 0, bashingPoints: max(0, successes - ratedPoints) }`. Scratch calculator state (successes,
rating, type) lives in a module-level `Map` keyed by `charId`, deliberately outside `_scene` so it
never serialises into `sessionStorage` — this is scratch input, not durable combat-scene state, per
the story's own Decisions. Cleared on `removeCombatant` (per-character) and `_clearScene`/End Combat
(whole Map). `_splitApply` calls the existing `applyDmg` for both halves, **awaited in sequence
rather than fired together** — reasoning recorded in the code: `applyDmg`/`trackerAdj` reads the
cached tracker row, mutates it, and schedules a background write, so two overlapping calls for the
same character risk interleaving their reads and silently losing one delta. This wasn't asked for
explicitly by the story but is exactly the right defensive call given the shape of `trackerAdj`.

**Verified against all five worked examples given in the dev-story brief, independently reproduced
during review (see Senior Developer Review below), matching exactly:** 5/1→1L+5B, 5/0→1L+4B (not
1L+5B), 1/0→1L+0B, 0/0→nothing, 0/2 Aggravated→2 Agg+0B.

**Real finding, disclosed rather than resolved unilaterally:** `_splitApply` is the first call site in
this file's history to ever send a damage delta greater than 1. `tracker.js`'s own `trackerAdj` only
guards against a positive delta when the track is *already* full — it doesn't clamp the delta's own
size against remaining headroom — so a large split applied to a nearly-full health track can push
stored damage past `maxHp` in one call, where the equivalent individual `+1` clicks would have
stopped at the ceiling. Confirmed pre-existing (the guard itself is untouched by this story), not
patched here since it's a `tracker.js`-level property any future bulk-damage feature would also hit,
not something scoped to this story's own Acceptance Criteria. Logged to `deferred-work.md`. Test
fixtures were built with headroom specifically to avoid asserting against this edge case rather than
silently depending on it.

**Class-naming deviation, reasoned:** the two steppers use a new class (`.cbt-split-step`) rather than
reusing `.cbt-track-btn` directly on the markup, because `cmb.1`'s own test counts `.cbt-track-btn`
elements to prove exactly four Vitae/Willpower buttons exist — adding two more of that literal class
would have silently broken an earlier, unrelated story's assertion. The CSS rule itself is still
shared (`.cbt-track-btn, .cbt-split-step { ... }`), satisfying the reuse-before-inventing standard
without touching `cmb.1`'s own spec or test.

New tests: `server/tests/cmb-3c-damage-split.test.js` (46, the pure function's own boundary coverage)
and `tests/cmb-3c-damage-split.spec.js` (30, AC1-AC8 in the real browser). A self-run mutation check
(changing the `rating === 0` branch to `bashingPoints: successes`, the exact off-by-one this story's
own spec called out as the likeliest bug) failed 5 Playwright + 8 vitest tests; reverted and
re-confirmed clean.

## Senior Developer Review

**Independently re-verified, not trusted on the subagent's report alone** (bmad-epic-loop Phase 3,
orchestrator inline, 2026-09-01 — the epic's final review):
- Re-ran every claimed suite myself: four vitest suites together — 177/177. All five Playwright specs
  together (`cmb-1` through `cmb-3c`) — 123/123, matching the reported counts exactly, all earlier
  specs unmodified.
- Read `computeKindredSplit` directly and confirmed it matches the quoted Errata text and the
  pseudocode given to the implementer, character for character. Confirmed the sequential-await
  reasoning in `_splitApply` against the real shape of `applyDmg`/`trackerAdj` — a genuinely correct
  defensive call, not just asserted by a comment.
- Independently investigated the flagged `trackerAdj` headroom finding rather than taking the
  subagent's description on faith: read the guard clause directly
  (`if (delta > 0 && used >= maxHp) return;`), confirmed it only checks *before* applying, never caps
  the delta itself, and confirmed this is a real, pre-existing property that `cmb.3c`'s Apply button
  is simply the first code ever to exercise with a delta greater than 1. Logged to `deferred-work.md`
  with both candidate fixes named, not resolved unilaterally in this story — it's a shared concern
  beyond this story's own scope.
- Confirmed the `.cbt-split-step`/`.cbt-track-btn` grouped-selector fix genuinely avoids the
  collision it claims to avoid: `cmb.1`'s test counts `.cbt-track-btn` elements specifically, and the
  new steppers carry a different class name while sharing the CSS rule body.
- **Visually verified directly**: a throwaway Playwright harness set the calculator to 5 successes,
  rating 1, confirmed the live preview read the exact both-audiences sentence from the story spec,
  pressed Apply, and confirmed the health track showed exactly 1 Lethal (crimson) + 5 Bashing (grey)
  boxes with the header updating to "6/7" — matching hand arithmetic exactly — then deleted the
  harness and its screenshots.

**Three-lens findings, triaged:**
- **(Low, pre-existing, logged to `deferred-work.md`, not patched)** The `trackerAdj` headroom-clamp
  gap described above. Real, newly reachable, not a defect against this story's own ACs.
- No High or unresolved Medium findings against this story's own Acceptance Criteria. AC1-AC8 all
  independently confirmed, including the off-by-one boundary at successes=1 vs successes=5 that the
  story spec itself flagged as the likeliest real bug — it isn't one.

**Verdict: done.** This is Epic CMB's fifth and final story. All five stories are now `done`, reviewed,
and clean — see the epic file's own close-out notes for the full record.

## Change Log

- 2026-09-01: Story created (bmad-epic-loop, Phase 1), ready-for-dev. Formula re-derived directly
  from the Errata's own quoted text plus the core rulebook's additive damage rule, not approximated.
- 2026-09-01: Dev-story complete (Phase 2, Opus subagent). Formula verified against five worked
  examples, one pre-existing `tracker.js` edge case found and disclosed rather than patched.
- 2026-09-01: Independently re-verified + 3-lens reviewed (Phase 3, orchestrator inline). One Low
  finding logged to `deferred-work.md`. Status → done. Epic CMB complete.
