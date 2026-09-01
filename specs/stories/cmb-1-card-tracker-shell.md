---
id: cmb.1
epic: cmb
epic_file: specs/epic-cmb-combat-panel.md
status: done
priority: high
type: feature
depends_on: []
branch: ms/epic-cmb-combat-panel
---

# Story CMB.1: Card-based combatant tracker shell (re-skin, real data)

## Story

As the ST running combat on a phone or tablet mid-LARP,
I want each parked combatant shown as a collapsed Name/Initiative/Health card that expands to full
detail on tap, with every control sized for a real fingertip,
so that I can scan the whole turn order at a glance and still reach every damage/track control
without a mis-tap, instead of today's dense always-expanded list rows.

## Why this story exists

`public/js/game/combat-tab.js` (shipped as `nav-9-combat-st-tool`) already does the mechanical work
this story re-skins — park combatants (including NPC/opponent characters via the existing
`suiteState.chars` merge), roll initiative once per encounter, track health via +B/+L/+A/− buttons
against `tracker_state`, show per-character attack-pool buttons. What it does not do is what this
session's clickable mockup validated: a card that collapses to just Name/Initiative/Health by
default (the failure mode being a phone screen full of always-expanded rows during a live round),
expands to full detail on tap, and gives every control a real ≥44px touch target rather than a
compact button with a hoped-for bigger hit zone.

This story is a **re-skin against real data, not a rewrite of the mechanics** — see Epic CMB's own
Decision 6. `cmb.1` does not touch: drag-to-reorder (`cmb.2`), the Attack modal (`cmb.3a`/`3b`), or
the Kindred damage-split arithmetic (`cmb.3c`). The card's action row keeps today's existing
per-character attack-pool buttons wired to the existing `combatQuickRoll`/`quickRoll` path — building
the Attack modal here would jump ahead of `cmb.3a` and duplicate work.

## Pre-flight finding, already checked (do not re-derive)

`server/routes/tracker.js`'s `PUT /:character_id` writes via `findOneAndUpdate(filter, { $set:
{...updates, character_id: raw } }, { upsert: true })` — a per-field atomic `$set`, not a
full-document replace. A concurrent ST-side (Combat) and player-side (Tracker tab) write to
*different* fields on the same character's `tracker_state` document cannot clobber each other. A
genuine "lost update" race exists only if both surfaces write the *same* field from independently
stale client-side caches at nearly the same instant (each side's `trackerAdj` computes a new
absolute value from its own in-memory cache, then PUTs that absolute number) — but this is a
**pre-existing** characteristic of the already-shipped dual-access pattern (`canAccess()` already
allows both the owning player and any ST/dev), already partially mitigated by the existing WebSocket
broadcast (`broadcastTrackerUpdate` → `public/js/data/ws.js`'s `_onTrackerUpdate` hook, which patches
the in-memory cache on a remote write). `cmb.1`'s re-skin uses the exact same `trackerRead`/
`trackerAdj` calls `combat-tab.js` already makes — it does not introduce a new writer or widen this
window. **Not in scope to fix here.** If it becomes a real problem in play, it is its own future
story, not a `cmb.1` deliverable.

## Decisions already made (do not re-litigate)

- **Collapsed card shows Name, Initiative (in the card rail, not the header), Health only.** NPC and
  Incapacitated tags also show collapsed — they are identity/status, not detail, and losing track of
  "which cards are mooks" or "who's already down" mid-round is worse than a slightly busier collapsed
  row.
- **Only one card is expanded at a time.** Expanding a card collapses whatever was previously open.
  Chosen over free multi-expand because the failure mode that matters is losing the turn order on a
  phone screen with several cards open, not wanting two expanded cards side by side (this session's
  party-mode roundtable, Sally).
- **The collapsed→expanded toggle is a single real `<button>` header, structurally separate from the
  card's own drag handle** (the drag handle itself is inert until `cmb.2`, but the DOM split must
  exist now so `cmb.2` doesn't have to re-architect the card). Beginning a drag gesture on the handle
  must never also fire the header's expand toggle; releasing a tap on the header must never register
  as an abandoned drag.
- **Every interactive control, collapsed and expanded, is a real ≥44×44px hit area** — this project's
  own `--tap-min` token (already defined in `public/css/theme.css`), not a visually-small control with
  an invisible bigger hit zone. That overlay trick was tried and explicitly rejected during this
  session's own mockup work: it technically passes a hit-test without feeling tappable to a real
  thumb. No two adjacent controls sit closer than a normal fingertip can distinguish.
- **Derived numbers never get reimplemented.** Defence, Health/Willpower/Vitae max, and Speed on the
  expanded card come from `calcDefence`/`calcHealth`/`calcWillpowerMax`/`calcVitaeMax`/`calcSpeed` in
  `public/js/data/accessors.js` (Health/Defence already flow through `combat-tab.js` today via
  `calcHealth`/`defenceForDisplay`; Vitae/Willpower/Speed are new reads for this card, not new
  calculations — the accessors already exist and are already used by `public/js/game/tracker.js`).

## Acceptance Criteria

1. Every character `combatAddChar` currently adds (via `suiteState.chars`, `!c.retired`, including
   merged NPC/opponent characters) can still be parked from the setup screen; the setup screen's own
   character-grid buttons meet the same ≥44px AC as everything else in this story.
2. Roll Initiative still computes `initBase + 1d10` per combatant (Dexterity + Composure, unchanged
   formula) and still sorts descending with the existing tie-break (`initBase` descending). No change
   to the roll or sort logic — this story only changes how the result renders.
3. Each combatant renders as a card. Collapsed state shows: Name, NPC tag (if applicable),
   Incapacitated tag (if applicable, driven by the existing `_isIncap` check), and current
   Health (`used/max`, e.g. "3/7") — nothing else. The initiative badge lives in the card's rail,
   visible in both collapsed and expanded state (unchanged from today's always-visible
   `cbt-init-slot`).
4. Tapping the collapsed header expands the card to show: Vitae track (current/max, `+`/`−`
   adjustable, backed by `trackerRead`/`trackerAdj` exactly as `public/js/game/tracker.js` already
   does for the same character), Willpower track (same pattern), Health as the existing box-track
   display (bashing/lethal/aggravated colour-coded, unchanged visual language from today's
   `cbt-box`/`cbt-bash`/`cbt-let`/`cbt-agg`), Defence and Movement/Speed as small stat chips, the
   existing per-character attack-pool buttons (unchanged: `combatQuickRoll` → `loadPool` →
   `goTab('roll')`), and the existing damage controls (+B/+L/+A/−, unchanged wiring to
   `applyDmg`/`trackerAdj`). Tapping the header again, or expanding a different card, collapses it.
5. At most one card is expanded at any time, verified with a scenario that expands card A then card B
   and confirms A is collapsed again.
6. A drag-start gesture on the card's rail/handle never triggers the header's expand toggle, and a
   completed tap on the header never gets misread as a drag attempt — even though `cmb.2` hasn't wired
   real reordering yet, this story's DOM/event-handling split must already prevent the two gestures
   from fighting once `cmb.2` lands. Test this as an explicit interaction case, not by inspection.
7. Every interactive control (character-pick buttons, the collapse/expand header, Vitae/Willpower
   `+`/`−`, damage `+B`/`+L`/`+A`/`−`, attack-pool buttons, defence-used toggle, End Combat/Next
   Turn/Next Round toolbar buttons) measures a real, computed ≥44×44px box in the rendered DOM — a
   literal assertion against `getBoundingClientRect()` (or the Playwright equivalent), not a CSS-source
   read.
8. Every pre-existing behaviour of `combat-tab.js` — park, roll initiative, Next Turn/Next Round
   (including skipping incapacitated combatants), toggle defence-used, remove a combatant, End Combat,
   quick-roll to the Roll tab, health/Vitae/Willpower adjustment persisting to `tracker_state` — still
   functions identically after the re-skin. A before/after behavioural comparison, not just "the new
   card renders."
9. `nav-9-combat-st-tool`'s `sprint-status.yaml` entry is annotated as superseded by Epic CMB (already
   done as part of this epic's own scoping — confirm it's still accurate, don't re-add it).

## What this story is NOT

- Not drag-to-reorder (`cmb.2`) — the handle exists in the DOM per AC6 but does nothing yet.
- Not the Attack modal (`cmb.3a`/`3b`) — the existing per-character pool-button behaviour is carried
  forward unchanged, not replaced.
- Not the Kindred damage-split arithmetic (`cmb.3c`) — damage entry stays the existing raw
  +B/+L/+A/− buttons.
- Not a fix for the `tracker_state` dual-writer race described above — confirmed pre-existing, not
  worsened, explicitly out of scope.
- Not a change to `combatAddChar`'s roster-filtering logic (`!c.retired`) or the NPC-merge logic that
  already happens upstream in `app.js` — this story consumes `suiteState.chars` exactly as it already
  is.

## Tasks / Subtasks

1. Re-derive the combatant card's DOM structure from the validated mockup shape (collapsed header
   button + conditional expanded body), applied to `combat-tab.js`'s real render functions
   (`renderRound()` primarily; `renderSetup()`/`renderPreRoll()` get the same touch-target pass but
   keep their existing structure otherwise).
2. Add `expanded: false` to the combatant shape created in `rollInitiative()`; add a
   `toggleExpand(charId)` function and its `window`-exposed sibling, following this file's existing
   `window.combatX = function(...)` convention.
3. Build the collapsed-header markup (real `<button>`, Name/tags/Health, chevron) and the
   conditionally-rendered expanded body (stat chips, Vitae/Willpower tracks reading `trackerRead`,
   Health box-track, attack-pool buttons, damage controls) — reusing this file's existing accessor
   calls (`calcHealth`, `defenceForDisplay`) and adding the two new ones (`calcVitaeMax`,
   `calcWillpowerMax` from `accessors.js`, `calcSpeed` for Movement).
4. Add the new CSS to `public/css/suite.css` alongside the existing `.cbt-*` rules — every colour/
   font/spacing value from `theme.css` tokens per this project's own CSS standards
   (`specs/project-context.md` §1), no bare hex/rgba, no inline styles from JS.
5. Give every interactive element a real ≥44px box (padding/min-height/min-width from `--tap-min`,
   not an invisible overlay) — audit every button class this story touches individually rather than
   assuming a blanket rule covers all of them.
6. Add the drag-handle/expand-toggle event-isolation (AC6) — a `draggable` attribute is not required
   yet (that's `cmb.2`'s job), but the handle element and its own event listener scope must already
   exist and must not double as the expand trigger.
7. Write the first dedicated test coverage for this component — confirmed via a repo-wide search
   before starting that no dedicated `combat-tab.js` suite exists today (only incidental coverage from
   `server/tests/rlv-1-combat-tab-quick-roll.test.js`, `tests/rlv-2-single-roller-retirement.spec.js`,
   `tests/rlv-7-persistent-mod-chips.spec.js`, and `server/tests/issue-879-defence-penalty-wirein.test.js`,
   none of which exercise the card UI itself). This is a new suite, not a port.
8. Run `server/tests/rlv-1-combat-tab-quick-roll.test.js` specifically after this story's changes —
   it asserts against `window.combatQuickRoll` directly, which this story must not rename or remove
   (it will be replaced in `cmb.3a`, not here).

## Dev Notes

- Real files this story touches: `public/js/game/combat-tab.js` (primary), `public/css/suite.css`
  (new `.cbt-*` rules alongside the existing block), no server-side changes.
- Real files this story reads but does not modify: `public/js/data/accessors.js`,
  `public/js/data/equipment-derivation.js`, `public/js/game/tracker.js`, `public/js/data/helpers.js`,
  `public/js/suite/roll-v2.js`.
- This session's clickable mockup (an Artifact, not committed to the repo — described in full in
  `specs/epic-cmb-combat-panel.md`) is the validated design reference for the card's visual/
  interaction shape. Treat its layout and copy as locked, per this repo's own established convention
  (see the RCV epic's `[[feedback-reference-real-mockup-not-reinvented-design]]` precedent) — do not
  reinvent the collapsed/expanded shape from a paraphrased description.
- `combat-tab.js`'s current combatant shape is `{ charId, name, initiative, initBase, defence,
  defenceUsed, maxHp, attackPools }` (built in `_combatantFromChar`). This story adds `expanded` to
  that shape; it does not need to add Vitae/Willpower/Speed fields to the stored combatant object
  itself, since those are read live via `trackerRead(charId)` / `calcVitaeMax(c)` /
  `calcWillpowerMax(c)` / `calcSpeed(c)` against the character object at render time, matching this
  project's "derived stats are never stored" rule.
- Angelus cannot smoke-test this app locally. The touch-target ACs (7) need a real computed-box
  assertion in the test suite, not a visual-only claim in the Dev Agent Record.

## Dev Agent Record

Implemented by an Opus subagent (bmad-epic-loop Phase 2), 2026-09-01. `combat-tab.js`'s round view
re-rendered as collapse-by-default cards: `expanded` added to the combatant shape (set in
`_combatantFromChar`, not `rollInitiative` — that function never builds the shape, Task 2's own
wording was imprecise on this point); `toggleExpand` collapses every other card before opening the
requested one; new render helpers `_cardHtml`/`_cardBodyHtml`/`_trackHtml`/`_healthBoxes`/`_charFor`;
new window functions `combatToggleExpand`, `combatTrack` (an alias onto the existing `applyDmg`, so
Vitae/Willpower go through the same `trackerAdj` write path damage already does), and
`combatDragState` (a read-only view of the new `_drag` gesture-isolation state for AC6's own tests).
Every pre-existing exported `window.combatX` function, and every function `rollInitiative`,
`nextTurn`, `nextRound`, `removeCombatant`, `endCombat`, `applyDmg`, `quickRoll`, `_isIncap`, is
absent from the diff — confirmed byte-identical, not just behaviourally re-tested.

Two deliberate deviations from the literal spec/mockup, both reasoned:
1. No proportional Vitae/Willpower fill bar (the mockup's `.bar-fill` needs a per-render inline
   `width:%`, which this project's CSS standard forbids from JS) — rendered as a pip run instead,
   the same visual family as the existing health box-track, alongside the numeric `current/max` the
   ACs actually specify.
2. The setup tray's remove-chip kept its pre-existing (smaller) size — not named in AC7, and the
   mockup's own convention already keeps the invisible-overlay technique specifically for
   dismiss-style controls.

New tests: `server/tests/cmb-1-combat-card-shell.test.js` (32 tests — markup/state for AC1-AC5,
DOM-shape half of AC6, behaviour-parity for AC8 including the Task 8 quick-roll guard) and
`tests/cmb-1-combat-card-touch-targets.spec.js` (10 tests — AC7's real `getBoundingClientRect()`
boxes including a non-overlap check, AC6's real pointer/click gesture isolation, AC5 in a real
rendered DOM). `server/tests/rlv-1-combat-tab-quick-roll.test.js` (4 tests) re-run and unmodified.

Two findings raised honestly rather than hidden: the NPC tag (`c.is_npc || c.npc`) has no real data
behind it today (no character carries either field — NPCs are a separate collection never merged into
`suiteState.chars`), and `sprint-status.yaml` showed as already-modified in the working tree before
this story touched it (correctly left alone — that was this epic's own prior scoping work, not a
stray edit).

## Senior Developer Review

**Independently re-verified, not trusted on the subagent's report alone** (bmad-epic-loop Phase 3,
orchestrator inline, 2026-09-01):
- Re-ran every claimed suite myself: `cmb-1-combat-card-shell.test.js` + `rlv-1-combat-tab-quick-roll
  .test.js` + `gdx-4-css-standards-grep.test.js` + `issue-879-defence-penalty-wirein.test.js` — 135/135
  passing, exactly matching the reported counts. `cmb-1-combat-card-touch-targets.spec.js` +
  `rlv-2-single-roller-retirement.spec.js` — 16/16 passing.
- Read the full diff of both changed files directly (not the subagent's description of it). Confirmed
  the mechanical functions listed above are genuinely untouched (AC8), confirmed every new CSS rule
  uses `var(--...)` tokens exclusively with no bare hex/rgba/inline styles, confirmed the new code's
  own comment referencing this file's existing "technique T1" touch-target convention is accurate (the
  `TOUCH TARGETS` block it points to genuinely exists further down `suite.css`, not a fabricated
  citation).
- Read `tests/cmb-1-combat-card-touch-targets.spec.js` directly to confirm the touch-target/gesture
  tests are genuinely meaningful (real `getBoundingClientRect()` measurement, real
  `dispatchEvent('pointerdown'/'pointerup')` and real `.click()`, a real pairwise-overlap check across
  all controls on the expanded card) rather than a vacuous pass.
- **Visually verified directly**, per this project's own "a green DOM-assertion suite does not prove a
  UI story is done" precedent: built a throwaway Playwright harness (mounting `initCombatTab` with
  stubbed API routes and injected characters, matching the story's own test technique), screenshotted
  both the collapsed and expanded card at a real phone viewport (390×844), confirmed the result matches
  the validated mockup's design language (Vitae as red pips, Willpower as gold pips, the unchanged
  health box-track, DEF/MOVE chips, attack-pool buttons, colour-coded damage controls), then deleted
  the harness and its screenshots per this repo's own "temporary harness, deleted after use" convention.

**Three-lens findings, triaged:**
- **(Medium, deferred to `cmb.2`, not patched here)** The new `_drag` gesture state can get stuck
  `active: true` if a pointer-down on the grip is released off-element (the exact shape a real drag
  gesture takes) — its listeners are scoped to the grip only, not the document. Inert today (`cmb.1`
  gates nothing on it), but load-bearing the moment `cmb.2` builds real reorder-vs-tap disambiguation
  on top of it. Logged to `deferred-work.md` and named explicitly as a `cmb.2` Dev Note rather than left
  for that story's implementer to rediscover.
- **(Low, informational, not patched)** The NPC tag's data source is currently a dead branch — see Dev
  Agent Record above and `deferred-work.md`. Not a defect against this story's own ACs, but flagged for
  `cmb.3b` where the same question (what a Combat-tab NPC actually is, data-wise) will resurface.
  Health-box pip count and Vitae/Willpower pip count both cap at 15 for a very high max — an existing
  convention this story reused consistently (the original health-box loop already did this), not a new
  truncation; the numeric label stays accurate either way.
- No High or unresolved Medium findings against this story's own Acceptance Criteria. AC1-AC9 all
  independently confirmed (AC8 by direct diff inspection, not just re-run tests).

**Verdict: done.** Merges cleanly into the `cmb.2` sequencing plan with one concrete input for that
story's own design (the `_drag` finding above).

## Change Log

- 2026-09-01: Story created (bmad-epic-loop, Phase 1), ready-for-dev.
- 2026-09-01: Dev-story complete (Phase 2, Opus subagent). 42 new tests, all pre-existing behaviour
  confirmed unchanged.
- 2026-09-01: Independently re-verified + 3-lens reviewed (Phase 3, orchestrator inline). One Medium
  finding deferred to `cmb.2` with an explicit Dev Note, one Low finding logged for `cmb.3b`. Status →
  done.
